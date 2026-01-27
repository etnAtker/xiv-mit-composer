import type { Job, MitEvent } from '../../model/types';
import { MS_PER_SEC } from '../../constants/time';
import { getSkillDefinition, normalizeSkillId } from '../../data/skills';
import { JOB_ICON_LOCAL_SRC } from '../../data/icons';
import { fetchJobIconUrl } from '../../lib/xivapi/icons';
import { XivIcon } from '../XivIcon';
import { DraggableMitigation } from './DraggableMitigation';
import { EFFECT_BAR_COLOR, MIT_COLUMN_PADDING, MIT_COLUMN_WIDTH } from './timelineUtils';
import { canInsertMitigation } from '../../utils/playerCast';

interface ReprisalGhost {
  mit: MitEvent;
  targetJob: Job;
}

interface Props {
  containerId: string;
  setMitLaneRef: (element: HTMLElement | null) => void;
  mitX: number;
  mitAreaWidth: number;
  timelineHeight: number;
  reprisalGhosts: ReprisalGhost[];
  reprisalSkillColor?: string;
  reprisalZIndexMap: Map<string, number>;
  getEffectiveStartMs: (mit: MitEvent) => number;
  getMitColumnLeft: (columnIndex: number) => number;
  getMitColumnKey: (mit: MitEvent) => string;
  columnMap: Record<string, number>;
  mitEvents: MitEvent[];
  zoom: number;
  editingMitId: string | null;
  setEditingMitId: (id: string | null) => void;
  selectedMitIds: string[];
  setSelectedMitIds: (ids: string[]) => void;
  updateMitEvent: (id: string, updates: Partial<MitEvent>) => void;
  removeMitEvent: (id: string) => void;
  setContextMenu: (position: { x: number; y: number } | null) => void;
  activeDragId?: string | null;
  dragPreviewPx?: number;
  editPopoverPosition: { x: number; y: number } | null;
}

export function MitigationLayer({
  containerId,
  setMitLaneRef,
  mitX,
  mitAreaWidth,
  timelineHeight,
  reprisalGhosts,
  reprisalSkillColor,
  reprisalZIndexMap,
  getEffectiveStartMs,
  getMitColumnLeft,
  getMitColumnKey,
  columnMap,
  mitEvents,
  zoom,
  editingMitId,
  setEditingMitId,
  selectedMitIds,
  setSelectedMitIds,
  updateMitEvent,
  removeMitEvent,
  setContextMenu,
  activeDragId,
  dragPreviewPx = 0,
  editPopoverPosition,
}: Props) {
  const shouldPreviewGroup =
    !!activeDragId && dragPreviewPx !== 0 && selectedMitIds.includes(activeDragId);
  const previewIds = shouldPreviewGroup ? selectedMitIds.filter((id) => id !== activeDragId) : [];
  const previewEvents = previewIds.length
    ? mitEvents.filter((mit) => previewIds.includes(mit.id))
    : [];

  return (
    <div
      id={containerId}
      ref={setMitLaneRef}
      className="absolute z-20 pointer-events-none"
      style={{ left: mitX, top: 0, width: mitAreaWidth, height: timelineHeight }}
    >
      {previewEvents.map((mit) => {
        const top = (mit.tStartMs / MS_PER_SEC) * zoom + dragPreviewPx;
        const effectHeight = (mit.durationMs / MS_PER_SEC) * zoom;
        const height = 40 + effectHeight;
        const columnKey = getMitColumnKey(mit);
        const columnIndex = columnMap[columnKey];
        if (columnIndex === undefined) return null;
        const left = getMitColumnLeft(columnIndex) + MIT_COLUMN_PADDING;
        const barWidth = MIT_COLUMN_WIDTH - MIT_COLUMN_PADDING * 2;
        const skillDef = getSkillDefinition(mit.skillId);
        const ghostColor = skillDef?.color || 'bg-slate-600';

        return (
          <div
            key={`drag-preview-${mit.id}`}
            style={{
              position: 'absolute',
              top,
              left,
              width: barWidth,
              height,
              zIndex: 5,
              pointerEvents: 'none',
            }}
            className="opacity-60"
          >
            <div className="flex w-full flex-col">
              <div
                className={`flex h-10 w-full items-center justify-center border border-white/10 text-[10px] font-semibold text-white ${ghostColor}`}
              />
              <div
                className="w-full border-x border-white/10 shadow-inner"
                style={{ height: effectHeight, backgroundColor: EFFECT_BAR_COLOR }}
              />
            </div>
          </div>
        );
      })}
      {reprisalGhosts.map(({ mit, targetJob }) => {
        const columnKey = `${normalizeSkillId(mit.skillId)}:${targetJob}`;
        const columnIndex = columnMap[columnKey];
        if (columnIndex === undefined) return null;
        const top = (getEffectiveStartMs(mit) / MS_PER_SEC) * zoom;
        const effectHeight = (mit.durationMs / MS_PER_SEC) * zoom;
        const height = 40 + effectHeight;
        const ghostColor = reprisalSkillColor ?? 'bg-slate-600';
        const reprisalIndex = reprisalZIndexMap.get(mit.id) ?? 0;
        const iconJob = mit.ownerJob ?? targetJob;

        return (
          <div
            key={`reprisal-ghost-${mit.id}-${targetJob}`}
            style={{
              position: 'absolute',
              top,
              left: getMitColumnLeft(columnIndex),
              width: MIT_COLUMN_WIDTH,
              height,
              zIndex: 10 + reprisalIndex,
              pointerEvents: 'none',
            }}
            className="opacity-50"
          >
            <div className="flex w-full flex-col">
              <div
                className={`flex h-10 w-full items-center justify-center border border-white/10 text-[10px] font-semibold text-white ${ghostColor}`}
              >
                <XivIcon
                  localSrc={JOB_ICON_LOCAL_SRC[iconJob]}
                  remoteSrc={() => fetchJobIconUrl(iconJob)}
                  alt={`${iconJob} icon`}
                  className="h-full w-full object-cover"
                  fallback={iconJob}
                />
              </div>
              <div
                className="w-full border-x border-white/10 shadow-inner"
                style={{ height: effectHeight, backgroundColor: EFFECT_BAR_COLOR }}
              />
            </div>
          </div>
        );
      })}
      {mitEvents.map((mit) => {
        const top = (mit.tStartMs / MS_PER_SEC) * zoom;
        const effectHeight = (mit.durationMs / MS_PER_SEC) * zoom;
        const skillDef = getSkillDefinition(mit.skillId);
        const cooldownMs = (skillDef?.cooldownSec ?? 0) * MS_PER_SEC;
        const cooldownHeight = (cooldownMs / MS_PER_SEC) * zoom;
        const height = 40 + effectHeight + cooldownHeight;
        const columnKey = getMitColumnKey(mit);
        const columnIndex = columnMap[columnKey];
        if (columnIndex === undefined) return null;
        const left = getMitColumnLeft(columnIndex);
        const barWidth = MIT_COLUMN_WIDTH - MIT_COLUMN_PADDING * 2;

        const isEditing = editingMitId === mit.id;
        const reprisalIndex = reprisalZIndexMap.get(mit.id);
        const baseZ = isEditing ? 200 : 10;
        const zIndex = reprisalIndex !== undefined ? baseZ + reprisalIndex : baseZ;

        return (
          <div
            key={mit.id}
            style={{
              position: 'absolute',
              top,
              left,
              width: MIT_COLUMN_WIDTH,
              height,
              zIndex,
              pointerEvents: 'auto',
            }}
            className={!isEditing ? 'hover:z-20' : ''}
          >
            <DraggableMitigation
              mit={mit}
              left={MIT_COLUMN_PADDING}
              width={barWidth}
              effectHeight={effectHeight}
              cooldownHeight={cooldownHeight}
              onUpdate={(id, update) => updateMitEvent(id, update)}
              onRemove={(id) => removeMitEvent(id)}
              isEditing={isEditing}
              onEditChange={(val) => setEditingMitId(val ? mit.id : null)}
              editPosition={isEditing ? editPopoverPosition : null}
              canUpdateStart={(nextStartMs) =>
                canInsertMitigation(
                  mit.skillId,
                  nextStartMs,
                  mitEvents,
                  mit.ownerJob ?? undefined,
                  mit.ownerId ?? undefined,
                  new Set([mit.id]),
                )
              }
              isSelected={selectedMitIds.includes(mit.id)}
              onSelect={(selectedMit, e) => {
                if (e.ctrlKey || e.metaKey) {
                  if (selectedMitIds.includes(selectedMit.id)) {
                    setSelectedMitIds(selectedMitIds.filter((id) => id !== selectedMit.id));
                  } else {
                    setSelectedMitIds([...selectedMitIds, selectedMit.id]);
                  }
                } else {
                  setSelectedMitIds([selectedMit.id]);
                  if (editingMitId && editingMitId !== selectedMit.id) {
                    setEditingMitId(null);
                  }
                }
                setContextMenu(null);
              }}
              onRightClick={(e, selectedMit) => {
                e.stopPropagation();
                if (!selectedMitIds.includes(selectedMit.id)) {
                  setSelectedMitIds([selectedMit.id]);
                }
                if (editingMitId) {
                  setEditingMitId(null);
                }
                setContextMenu({ x: e.clientX, y: e.clientY });
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
