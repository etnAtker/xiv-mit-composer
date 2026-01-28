import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { CastEvent, DamageEvent, Job, MitEvent } from '../../model/types';
import { useStore } from '../../store';
import { useShallow } from 'zustand/shallow';
import { ContextMenu } from './ContextMenu';
import { PinnedTimelineLanes } from './PinnedTimelineLanes';
import type { TimelineSkillColumn, TooltipData } from './types';
import { buildSkillZIndexMap, MIT_COLUMN_WIDTH } from './timelineUtils';
import { DAMAGE_LANE_WIDTH } from '../../constants/timeline';
import { MS_PER_SEC } from '../../constants/time';
import { SKILLS, normalizeSkillId } from '../../data/skills';
import { TimelineHeader } from './TimelineHeader';
import { TimelineBackground } from './TimelineBackground';
import { TimelineGridLines } from './TimelineGridLines';
import { MitigationLayer } from './MitigationLayer';
import { DamageLayers } from './DamageLayers';
import { TimelineTooltip } from './TimelineTooltip';
import { useTimelineScroll } from './useTimelineScroll';
import { useBoxSelection } from './useBoxSelection';
import { buildDropZoneId, type DropZoneData } from '../../dnd/types';

const VISIBLE_RANGE_BUFFER_MS = 5000;
const ZOOM_WHEEL_STEP = 5;
const RULER_STEP_SEC = 5;
const HEADER_HEIGHT = 64;

interface Props {
  containerId: string;
  zoom: number;
  setZoom: (value: number) => void;
  timelineHeight: number;
  durationSec: number;
  totalWidth: number;
  totalHeight: number;
  rulerWidth: number;
  castWidth: number;
  castX: number;
  dmgWidth: number;
  dmgX: number;
  mitX: number;
  mitAreaWidth: number;
  skillColumns: TimelineSkillColumn[];
  castEvents: CastEvent[];
  damageEvents: DamageEvent[];
  secondaryDamageEvents?: DamageEvent[];
  mitEvents: MitEvent[];
  columnMap: Record<string, number>;
  activeDragId?: string | null;
  dragPreviewPx?: number;
  selectedJobs?: Job[];
}

export function TimelineCanvas({
  containerId,
  zoom,
  setZoom,
  timelineHeight,
  durationSec,
  totalWidth,
  totalHeight,
  rulerWidth,
  castWidth,
  castX,
  dmgWidth,
  dmgX,
  mitX,
  mitAreaWidth,
  skillColumns,
  castEvents,
  damageEvents,
  secondaryDamageEvents = [],
  mitEvents,
  columnMap,
  activeDragId,
  dragPreviewPx = 0,
  selectedJobs,
}: Props) {
  const { updateMitEvent, removeMitEvent, selectedMitIds, setSelectedMitIds } = useStore(
    useShallow((state) => ({
      updateMitEvent: state.updateMitEvent,
      removeMitEvent: state.removeMitEvent,
      selectedMitIds: state.selectedMitIds,
      setSelectedMitIds: state.setSelectedMitIds,
    })),
  );
  const [editingMitId, setEditingMitId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [lastContextMenuPosition, setLastContextMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [editPopoverPosition, setEditPopoverPosition] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  const handleEditingChange = useCallback((id: string | null) => {
    setEditingMitId(id);
    if (!id) {
      setEditPopoverPosition(null);
    }
  }, []);

  // dnd-kit 的 lane 投放区 (drop target) 元数据：id 保持稳定，`msPerPx` 用于时间换算。
  const mitLaneDropZone: DropZoneData = {
    kind: 'mit-lane',
    timelineId: containerId,
    laneId: 'default',
    msPerPx: MS_PER_SEC / zoom,
  };

  const { setNodeRef: setMitLaneRef } = useDroppable({
    id: buildDropZoneId(mitLaneDropZone),
    data: mitLaneDropZone,
  });

  const { scrollRef, visibleRange, isScrolled, handleScroll } = useTimelineScroll({
    zoom,
    setZoom,
    headerHeight: HEADER_HEIGHT,
    visibleRangeBufferMs: VISIBLE_RANGE_BUFFER_MS,
    zoomWheelStep: ZOOM_WHEEL_STEP,
  });

  useEffect(() => {
    if (selectedMitIds.length === 0) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        target &&
        (target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')
      ) {
        return;
      }
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;

      event.preventDefault();
      selectedMitIds.forEach((id) => removeMitEvent(id));
      setSelectedMitIds([]);
      setContextMenu(null);
      handleEditingChange(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleEditingChange, removeMitEvent, selectedMitIds, setContextMenu, setSelectedMitIds]);

  const headerSkillColumns =
    skillColumns.length > 0
      ? skillColumns
      : [
          {
            id: 'mit-placeholder',
            columnId: 'mit-placeholder',
            name: '减伤',
            color: 'bg-surface-4',
            job: 'ALL',
          },
        ];

  const jobOrder = selectedJobs && selectedJobs.length > 0 ? selectedJobs : [];
  const jobGroups = jobOrder.map((job) => ({
    job,
    skills: headerSkillColumns.filter((skill) => skill.job === job),
  }));
  const utilitySkills = headerSkillColumns.filter((skill) => skill.job === 'ALL');
  const hasSecondaryDamageLane = jobOrder.length > 1;
  const primaryJob = jobOrder[0];
  const secondaryJob = jobOrder[1];
  const firstGroupCount = jobGroups[0]?.skills.length ?? 0;
  const secondaryDamageLaneLeft = mitX + firstGroupCount * MIT_COLUMN_WIDTH;

  const getMitColumnLeft = (columnIndex: number) => {
    const baseLeft = columnIndex * MIT_COLUMN_WIDTH;
    if (!hasSecondaryDamageLane || firstGroupCount === 0) return baseLeft;
    return columnIndex >= firstGroupCount ? baseLeft + DAMAGE_LANE_WIDTH : baseLeft;
  };
  const getLaneLineWidth = (job: Job | undefined, laneLeft: number) => {
    const fullWidth = mitX + mitAreaWidth - laneLeft;
    if (!job) return Math.max(dmgWidth, fullWidth);
    let lastIndex = -1;
    headerSkillColumns.forEach((skill, idx) => {
      if (skill.job === job) lastIndex = idx;
    });
    if (lastIndex < 0) return Math.max(dmgWidth, fullWidth);
    const rightEdge = mitX + getMitColumnLeft(lastIndex) + MIT_COLUMN_WIDTH;
    return Math.max(dmgWidth, rightEdge - laneLeft);
  };

  const primaryMitEvents =
    hasSecondaryDamageLane && primaryJob
      ? mitEvents.filter((mit) => mit.ownerJob === primaryJob || !mit.ownerJob)
      : mitEvents;
  const secondaryMitEvents =
    hasSecondaryDamageLane && secondaryJob
      ? mitEvents.filter((mit) => mit.ownerJob === secondaryJob)
      : [];

  const getMitColumnKey = (mit: MitEvent) => {
    const ownerJob = mit.ownerJob ?? selectedJobs?.[0];
    const baseSkillId = normalizeSkillId(mit.skillId);
    if (ownerJob) {
      const jobKey = `${baseSkillId}:${ownerJob}`;
      if (Object.prototype.hasOwnProperty.call(columnMap, jobKey)) {
        return jobKey;
      }
    }
    return baseSkillId;
  };

  const {
    boxSelection,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  } = useBoxSelection({
    columnMap,
    mitEvents,
    selectedMitIds,
    zoom,
    mitX,
    getMitColumnLeft,
    getMitColumnKey,
    setSelectedMitIds,
    setContextMenu,
    setEditingMitId: handleEditingChange,
  });

  const handleContextMenuChange = useCallback(
    (position: { x: number; y: number } | null) => {
      setContextMenu(position);
      if (position) {
        setLastContextMenuPosition(position);
      }
    },
    [setContextMenu, setLastContextMenuPosition],
  );

  const getEffectiveStartMs = useCallback((mit: MitEvent) => mit.tStartMs, []);

  const reprisalSkill = SKILLS.find((skill) => skill.id === 'role-reprisal');
  const reprisalZIndexMap = useMemo(
    () => buildSkillZIndexMap(mitEvents, 'role-reprisal', getEffectiveStartMs),
    [mitEvents, getEffectiveStartMs],
  );
  const reprisalGhosts =
    selectedJobs && selectedJobs.length > 1
      ? mitEvents.flatMap((mit) => {
          if (normalizeSkillId(mit.skillId) !== 'role-reprisal') return [];
          if (!mit.ownerJob) return [];
          return selectedJobs
            .filter((job) => job !== mit.ownerJob)
            .map((job) => ({
              mit,
              targetJob: job,
            }));
        })
      : [];
  const primaryLineWidth = getLaneLineWidth(primaryJob, dmgX);
  const secondaryLineWidth = hasSecondaryDamageLane
    ? getLaneLineWidth(secondaryJob, secondaryDamageLaneLeft)
    : dmgWidth;

  return (
    <div
      ref={scrollRef}
      className="relative flex-1 overflow-auto select-none custom-scrollbar bg-app text-app"
      onScroll={handleScroll}
    >
      <div style={{ width: totalWidth, height: totalHeight + HEADER_HEIGHT, position: 'relative' }}>
        <TimelineHeader
          totalWidth={totalWidth}
          height={HEADER_HEIGHT}
          rulerWidth={rulerWidth}
          castWidth={castWidth}
          dmgWidth={dmgWidth}
          isScrolled={isScrolled}
          jobGroups={jobGroups}
          utilitySkills={utilitySkills}
          hasSecondaryDamageLane={hasSecondaryDamageLane}
          primaryJob={primaryJob}
          secondaryJob={secondaryJob}
        />

        <div
          style={{ width: totalWidth, height: totalHeight, position: 'relative' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          {boxSelection.isActive && (
            <div
              className="absolute z-30 border-2 border-dashed border-[#1f6feb] bg-[#1f6feb]/10 pointer-events-none"
              style={{
                left: Math.min(boxSelection.startX, boxSelection.endX),
                top: Math.min(boxSelection.startY, boxSelection.endY),
                width: Math.abs(boxSelection.endX - boxSelection.startX),
                height: Math.abs(boxSelection.endY - boxSelection.startY),
              }}
            />
          )}

          <PinnedTimelineLanes
            rulerWidth={rulerWidth}
            castWidth={castWidth}
            durationSec={durationSec}
            totalHeight={totalHeight}
            timelineHeight={timelineHeight}
            zoom={zoom}
            visibleRange={visibleRange}
            castEvents={castEvents}
            onHover={setTooltip}
          />

          <div
            className="absolute left-0 top-0 overflow-hidden"
            style={{ width: totalWidth, height: timelineHeight }}
          >
            <TimelineBackground
              rulerWidth={rulerWidth}
              castWidth={castWidth}
              dmgWidth={dmgWidth}
              mitAreaWidth={mitAreaWidth}
              dmgX={dmgX}
              secondaryDamageLaneLeft={secondaryDamageLaneLeft}
              headerSkillColumns={headerSkillColumns}
              hasSecondaryDamageLane={hasSecondaryDamageLane}
              firstGroupCount={firstGroupCount}
              timelineHeight={timelineHeight}
            />

            <TimelineGridLines
              totalWidth={totalWidth}
              timelineHeight={timelineHeight}
              rulerWidth={rulerWidth}
              castX={castX}
              castWidth={castWidth}
              dmgX={dmgX}
              dmgWidth={dmgWidth}
              mitX={mitX}
              mitAreaWidth={mitAreaWidth}
              durationSec={durationSec}
              zoom={zoom}
              visibleRange={visibleRange}
              visibleRangeBufferMs={VISIBLE_RANGE_BUFFER_MS}
              rulerStepSec={RULER_STEP_SEC}
            />

            <MitigationLayer
              containerId={containerId}
              setMitLaneRef={setMitLaneRef}
              mitX={mitX}
              mitAreaWidth={mitAreaWidth}
              timelineHeight={timelineHeight}
              reprisalGhosts={reprisalGhosts}
              reprisalSkillColor={reprisalSkill?.color}
              reprisalZIndexMap={reprisalZIndexMap}
              getEffectiveStartMs={getEffectiveStartMs}
              getMitColumnLeft={getMitColumnLeft}
              getMitColumnKey={getMitColumnKey}
              columnMap={columnMap}
              mitEvents={mitEvents}
              zoom={zoom}
              editingMitId={editingMitId}
              setEditingMitId={handleEditingChange}
              selectedMitIds={selectedMitIds}
              setSelectedMitIds={setSelectedMitIds}
              updateMitEvent={updateMitEvent}
              removeMitEvent={removeMitEvent}
              setContextMenu={handleContextMenuChange}
              activeDragId={activeDragId}
              dragPreviewPx={dragPreviewPx}
              editPopoverPosition={editPopoverPosition}
            />

            <DamageLayers
              totalWidth={totalWidth}
              timelineHeight={timelineHeight}
              zoom={zoom}
              dmgWidth={dmgWidth}
              dmgX={dmgX}
              secondaryDamageLaneLeft={secondaryDamageLaneLeft}
              visibleRange={visibleRange}
              damageEvents={damageEvents}
              secondaryDamageEvents={secondaryDamageEvents}
              primaryMitEvents={primaryMitEvents}
              secondaryMitEvents={secondaryMitEvents}
              hasSecondaryDamageLane={hasSecondaryDamageLane}
              primaryLineWidth={primaryLineWidth}
              secondaryLineWidth={secondaryLineWidth}
              onHover={setTooltip}
            />
          </div>
        </div>
      </div>

      {contextMenu && selectedMitIds.length > 0 && (
        <ContextMenu
          items={[
            ...(selectedMitIds.length === 1
              ? [
                  {
                    label: '编辑事件',
                    onClick: () => {
                      handleEditingChange(selectedMitIds[0]);
                      setEditPopoverPosition(lastContextMenuPosition ?? contextMenu);
                      setContextMenu(null);
                    },
                  },
                ]
              : []),
            {
              label: selectedMitIds.length === 1 ? '删除' : `删除所选项 (${selectedMitIds.length})`,
              onClick: () => {
                selectedMitIds.forEach((id) => removeMitEvent(id));
                setContextMenu(null);
                setSelectedMitIds([]);
              },
              danger: true,
            },
          ]}
          position={contextMenu}
          onPositionResolved={setLastContextMenuPosition}
          onClose={() => {
            setContextMenu(null);
            setSelectedMitIds([]);
          }}
        />
      )}

      <TimelineTooltip tooltip={tooltip} />
    </div>
  );
}
