import { format } from 'date-fns';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { CastEvent, DamageEvent, Job, MitEvent } from '../../model/types';
import { useStore } from '../../store';
import { ContextMenu } from './ContextMenu';
import { DraggableMitigation } from './DraggableMitigation';
import { DamageLane } from './TimelineLanes';
import type { TooltipData } from './types';
import {
  buildSkillZIndexMap,
  EFFECT_BAR_COLOR,
  MIT_COLUMN_PADDING,
  MIT_COLUMN_WIDTH,
} from './timelineUtils';
import { MS_PER_SEC } from '../../constants/time';
import { MAX_ZOOM, MIN_ZOOM } from '../../constants/timeline';
import { SKILLS } from '../../data/skills';
import { XivIcon } from '../XivIcon';
import { JOB_ICON_LOCAL_SRC, getSkillIconLocalSrc } from '../../data/icons';
import { fetchActionIconUrl, fetchJobIconUrl } from '../../lib/xivapi/icons';

const VISIBLE_RANGE_BUFFER_MS = 5000;
const ZOOM_WHEEL_STEP = 5;
const RULER_STEP_SEC = 5;
const HEADER_HEIGHT = 64;

interface Props {
  containerId: string;
  zoom: number;
  setZoom: (value: number) => void;
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
  skillColumns: {
    id: string;
    columnId: string;
    name: string;
    color?: string;
    icon?: string;
    actionId?: number;
    job?: string;
  }[];
  castEvents: CastEvent[];
  damageEvents: DamageEvent[];
  mitEvents: MitEvent[];
  columnMap: Record<string, number>;
  activeDragId?: string | null;
  dragDeltaMs?: number;
  selectedJobs?: Job[];
}

export function TimelineCanvas({
  containerId,
  zoom,
  setZoom,
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
  mitEvents,
  columnMap,
  activeDragId,
  dragDeltaMs = 0,
  selectedJobs,
}: Props) {
  const { updateMitEvent, removeMitEvent, selectedMitIds, setSelectedMitIds } = useStore();
  const [editingMitId, setEditingMitId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  const [boxSelection, setBoxSelection] = useState({
    isActive: false,
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
  });

  const { setNodeRef: setMitLaneRef } = useDroppable({
    id: 'mit-lane',
    data: { type: 'lane' },
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 10000 });
  const prevZoomRef = useRef(zoom);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, clientHeight } = scrollRef.current;
    const visibleHeight = Math.max(0, clientHeight - HEADER_HEIGHT);

    const startSec = scrollTop / zoom;
    const endSec = (scrollTop + visibleHeight) / zoom;

    const newStart = Math.max(0, startSec * MS_PER_SEC - VISIBLE_RANGE_BUFFER_MS);
    const newEnd = endSec * MS_PER_SEC + VISIBLE_RANGE_BUFFER_MS;

    setVisibleRange((prev) => {
      if (
        Math.abs(prev.start - newStart) < MS_PER_SEC &&
        Math.abs(prev.end - newEnd) < MS_PER_SEC
      ) {
        return prev;
      }
      return { start: newStart, end: newEnd };
    });
  }, [zoom]);

  useEffect(() => {
    handleScroll();
  }, [zoom, handleScroll]);

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
      setEditingMitId(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedMitIds, removeMitEvent, setSelectedMitIds, setContextMenu, setEditingMitId]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const prevZoom = prevZoomRef.current;
    if (prevZoom === zoom) return;

    const startSec = el.scrollTop / prevZoom;
    const nextScrollTop = startSec * zoom;
    el.scrollTop = nextScrollTop;
    prevZoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleWheel = (event: WheelEvent) => {
      if (!event.altKey) return;
      event.preventDefault();
      event.stopPropagation();
      const delta = event.deltaY > 0 ? -ZOOM_WHEEL_STEP : ZOOM_WHEEL_STEP;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom + delta));
      setZoom(newZoom);
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, [zoom, setZoom]);

  const lineWidth = Math.max(0, totalWidth - dmgX);
  const encounterWidth = castWidth + dmgWidth;
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
  const jobGroups = jobOrder.map((job) => headerSkillColumns.filter((skill) => skill.job === job));
  const utilitySkills = headerSkillColumns.filter((skill) => skill.job === 'ALL');
  const jobToneMap: Record<string, string> = {
    PLD: 'bg-blue-500/5',
    WAR: 'bg-red-500/5',
    DRK: 'bg-purple-500/5',
    GNB: 'bg-emerald-500/5',
  };
  const jobHeaderToneMap: Record<string, string> = {
    PLD: 'bg-blue-900/20 text-blue-300',
    WAR: 'bg-red-900/20 text-red-300',
    DRK: 'bg-purple-900/20 text-purple-300',
    GNB: 'bg-emerald-900/20 text-emerald-300',
  };
  const getJobTone = (job: Job) => jobToneMap[job] || 'bg-[#1f6feb]/5';
  const getJobHeaderTone = (job: Job) => jobHeaderToneMap[job] || 'bg-[#1f6feb]/15 text-muted';

  const getMitColumnKey = (mit: MitEvent) => {
    const ownerJob = mit.ownerJob ?? selectedJobs?.[0];
    if (ownerJob) {
      const jobKey = `${mit.skillId}:${ownerJob}`;
      if (Object.prototype.hasOwnProperty.call(columnMap, jobKey)) {
        return jobKey;
      }
    }
    return mit.skillId;
  };

  const getVisualOffsetMs = useCallback(
    (mit: MitEvent) => {
      if (!activeDragId || dragDeltaMs === 0) return 0;
      const shouldMoveGroup = selectedMitIds.includes(activeDragId as string);
      const shouldMove =
        (shouldMoveGroup && selectedMitIds.includes(mit.id)) ||
        (!shouldMoveGroup && mit.id === activeDragId);
      return shouldMove ? dragDeltaMs : 0;
    },
    [activeDragId, dragDeltaMs, selectedMitIds],
  );

  const getEffectiveStartMs = useCallback(
    (mit: MitEvent) => mit.tStartMs + getVisualOffsetMs(mit),
    [getVisualOffsetMs],
  );

  const reprisalSkill = SKILLS.find((skill) => skill.id === 'role-reprisal');
  const reprisalZIndexMap = useMemo(
    () => buildSkillZIndexMap(mitEvents, 'role-reprisal', getEffectiveStartMs),
    [mitEvents, getEffectiveStartMs],
  );
  const reprisalGhosts =
    selectedJobs && selectedJobs.length > 1
      ? mitEvents.flatMap((mit) => {
          if (mit.skillId !== 'role-reprisal') return [];
          if (!mit.ownerJob) return [];
          return selectedJobs
            .filter((job) => job !== mit.ownerJob)
            .map((job) => ({
              mit,
              targetJob: job,
            }));
        })
      : [];

  const visibleCasts = castEvents.filter(
    (e) =>
      e.tMs >= visibleRange.start - VISIBLE_RANGE_BUFFER_MS &&
      e.tMs <= visibleRange.end + VISIBLE_RANGE_BUFFER_MS,
  );

  return (
    <div
      ref={scrollRef}
      className="relative flex-1 overflow-auto select-none custom-scrollbar bg-app text-app"
      onScroll={handleScroll}
    >
      <div style={{ width: totalWidth, height: totalHeight + HEADER_HEIGHT, position: 'relative' }}>
        <div
          className="sticky top-0 z-30 flex border-b border-app bg-surface-3 shadow-xl"
          style={{ width: totalWidth, height: HEADER_HEIGHT }}
        >
          <div
            className="flex h-full items-center justify-center border-r border-app text-[10px] font-mono uppercase text-muted"
            style={{ width: rulerWidth }}
          >
            Time
          </div>
          <div
            className="flex h-full items-center gap-2 border-r border-app px-4"
            style={{ width: encounterWidth }}
          >
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
              Encounter Timeline
            </span>
          </div>
          <div className="flex h-full flex-1">
            {jobGroups.map((group, index) => {
              const job = jobOrder[index];
              if (!job || group.length === 0) return null;
              return (
                <div
                  key={`job-${job}`}
                  className={`flex flex-col border-r border-app ${getJobTone(job)}`}
                  style={{ width: group.length * MIT_COLUMN_WIDTH }}
                >
                  <div
                    className={`flex h-6 py-3 items-center justify-center border-b border-app text-[14px] font-bold uppercase tracking-tight ${getJobHeaderTone(job)}`}
                  >
                    <div className="flex items-center gap-2">
                      <XivIcon
                        localSrc={JOB_ICON_LOCAL_SRC[job]}
                        remoteSrc={() => fetchJobIconUrl(job)}
                        alt={`${job} icon`}
                        className="h-5 w-5 object-contain"
                        fallback={job}
                      />
                      <span>{job}</span>
                    </div>
                  </div>
                  <div className="flex">
                    {group.map((skill) => (
                      <div
                        key={`head-${skill.columnId}`}
                        className="flex h-10 w-10 items-center justify-center"
                        title={skill.name}
                      >
                        <XivIcon
                          localSrc={getSkillIconLocalSrc(skill.actionId)}
                          remoteSrc={
                            skill.actionId ? () => fetchActionIconUrl(skill.actionId) : undefined
                          }
                          alt={skill.name}
                          className="h-full w-full object-cover"
                          fallback={skill.icon ?? skill.name.slice(0, 1)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {utilitySkills.length > 0 && (
              <div
                className="flex flex-1 flex-col border-r border-app bg-surface-2"
                style={{ width: utilitySkills.length * MIT_COLUMN_WIDTH }}
              >
                <div className="flex h-6 items-center px-4 border-b border-app bg-surface-3">
                  <span className="text-[12px] font-medium uppercase text-muted">
                    Party Utility
                  </span>
                </div>
                <div className="flex">
                  {utilitySkills.map((skill) => (
                    <div
                      key={`head-${skill.columnId}`}
                      className="flex h-10 w-10 items-center justify-center"
                      title={skill.name}
                    >
                      <XivIcon
                        localSrc={getSkillIconLocalSrc(skill.actionId)}
                        remoteSrc={
                          skill.actionId ? () => fetchActionIconUrl(skill.actionId) : undefined
                        }
                        alt={skill.name}
                        className="h-full w-full object-cover"
                        fallback={skill.icon ?? skill.name.slice(0, 1)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div
          style={{ width: totalWidth, height: totalHeight, position: 'relative' }}
          onMouseDown={(e) => {
            if (
              e.target === e.currentTarget ||
              (e.target as HTMLElement).tagName === 'svg' ||
              (e.target as HTMLElement).id === containerId
            ) {
              e.preventDefault();
              setContextMenu(null);
              setEditingMitId(null);

              const containerEl = e.currentTarget;
              const rect = containerEl.getBoundingClientRect();
              const startX = e.clientX - rect.left;
              const startY = e.clientY - rect.top;

              setBoxSelection({
                isActive: true,
                startX,
                startY,
                endX: startX,
                endY: startY,
              });

              const handleWindowMouseMove = (wEvent: MouseEvent) => {
                const currentRect = containerEl.getBoundingClientRect();
                setBoxSelection((prev) => ({
                  ...prev,
                  endX: wEvent.clientX - currentRect.left,
                  endY: wEvent.clientY - currentRect.top,
                }));
              };

              const handleWindowMouseUp = (wEvent: MouseEvent) => {
                window.removeEventListener('mousemove', handleWindowMouseMove);
                window.removeEventListener('mouseup', handleWindowMouseUp);

                const currentRect = containerEl.getBoundingClientRect();
                const endX = wEvent.clientX - currentRect.left;
                const endY = wEvent.clientY - currentRect.top;

                const selectionRect = {
                  left: Math.min(startX, endX),
                  top: Math.min(startY, endY),
                  right: Math.max(startX, endX),
                  bottom: Math.max(startY, endY),
                };

                const newlySelectedIds: string[] = [];
                const barWidth = MIT_COLUMN_WIDTH - MIT_COLUMN_PADDING * 2;
                mitEvents.forEach((mit) => {
                  const columnKey = getMitColumnKey(mit);
                  const columnIndex = columnMap[columnKey];
                  if (columnIndex === undefined) return;
                  const left = mitX + columnIndex * MIT_COLUMN_WIDTH + MIT_COLUMN_PADDING;
                  const top = (mit.tStartMs / MS_PER_SEC) * zoom;
                  const width = barWidth;
                  const effectHeight = (mit.durationMs / MS_PER_SEC) * zoom;
                  const skillDef = SKILLS.find((s) => s.id === mit.skillId);
                  const cooldownMs = (skillDef?.cooldownSec ?? 0) * MS_PER_SEC;
                  const cooldownHeight = (cooldownMs / MS_PER_SEC) * zoom;
                  const height = 40 + effectHeight + cooldownHeight;

                  if (
                    left >= selectionRect.left &&
                    left + width <= selectionRect.right &&
                    top >= selectionRect.top &&
                    top + height <= selectionRect.bottom
                  ) {
                    newlySelectedIds.push(mit.id);
                  }
                });

                if (wEvent.ctrlKey || wEvent.metaKey) {
                  const currentSelected = useStore.getState().selectedMitIds;
                  setSelectedMitIds([...new Set([...currentSelected, ...newlySelectedIds])]);
                } else {
                  setSelectedMitIds(newlySelectedIds);
                }

                setBoxSelection({
                  isActive: false,
                  startX: 0,
                  startY: 0,
                  endX: 0,
                  endY: 0,
                });
              };

              window.addEventListener('mousemove', handleWindowMouseMove);
              window.addEventListener('mouseup', handleWindowMouseUp);
            }
          }}
        >
          {boxSelection.isActive && (
            <div
              className="absolute z-50 border-2 border-dashed border-[#1f6feb] bg-[#1f6feb]/10 pointer-events-none"
              style={{
                left: Math.min(boxSelection.startX, boxSelection.endX),
                top: Math.min(boxSelection.startY, boxSelection.endY),
                width: Math.abs(boxSelection.endX - boxSelection.startX),
                height: Math.abs(boxSelection.endY - boxSelection.startY),
              }}
            />
          )}

          <div className="absolute inset-0 z-0 flex pointer-events-none">
            <div
              className="h-full border-r border-app bg-surface-2"
              style={{
                width: rulerWidth,
                backgroundSize: '100% 60px',
                backgroundImage:
                  'linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)',
              }}
            />
            <div
              className="h-full border-r border-app bg-surface"
              style={{
                width: encounterWidth,
                backgroundSize: '100% 60px',
                backgroundImage:
                  'linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)',
              }}
            />
            <div className="flex h-full" style={{ width: mitAreaWidth }}>
              {headerSkillColumns.map((skill) => (
                <div
                  key={`lane-${skill.columnId}`}
                  className="h-full border-r border-app"
                  style={{ width: MIT_COLUMN_WIDTH }}
                />
              ))}
            </div>
          </div>

          <div
            className="sticky left-0 z-20 h-full border-r border-app bg-surface-2 pr-2 text-right pointer-events-none"
            style={{ width: rulerWidth }}
          >
            <div className="relative h-full py-4">
              {Array.from({ length: Math.ceil(durationSec / RULER_STEP_SEC) }).map((_, i) => {
                const sec = i * RULER_STEP_SEC;
                const ms = sec * MS_PER_SEC;
                if (
                  ms < visibleRange.start - VISIBLE_RANGE_BUFFER_MS ||
                  ms > visibleRange.end + VISIBLE_RANGE_BUFFER_MS
                )
                  return null;
                const y = sec * zoom;
                return (
                  <div
                    key={`r-${sec}`}
                    className="absolute right-2 text-[10px] font-mono text-muted"
                    style={{ top: y }}
                  >
                    {format(new Date(0, 0, 0, 0, 0, sec), 'mm:ss')}
                  </div>
                );
              })}
            </div>
          </div>

          <svg
            width={totalWidth}
            height={totalHeight}
            className="absolute inset-0 z-10 block text-xs pointer-events-none"
          >
            <defs>
              <pattern
                id="diagonalHatchCooldown"
                width="10"
                height="10"
                patternTransform="rotate(45 0 0)"
                patternUnits="userSpaceOnUse"
              >
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="10"
                  style={{ stroke: 'var(--color-text-muted)', strokeWidth: 1 }}
                />
              </pattern>
              <pattern
                id="diagonalHatchUnusable"
                width="10"
                height="10"
                patternTransform="rotate(45 0 0)"
                patternUnits="userSpaceOnUse"
              >
                <line x1="0" y1="0" x2="0" y2="10" style={{ stroke: '#d29922', strokeWidth: 1 }} />
              </pattern>
            </defs>

            <rect x={0} y={0} width={rulerWidth} height={totalHeight} fill="transparent" />
            <rect x={castX} y={0} width={castWidth} height={totalHeight} fill="transparent" />
            <rect x={dmgX} y={0} width={dmgWidth} height={totalHeight} fill="transparent" />
            <rect x={mitX} y={0} width={mitAreaWidth} height={totalHeight} fill="transparent" />

            {Array.from({ length: Math.ceil(durationSec / RULER_STEP_SEC) }).map((_, i) => {
              const sec = i * RULER_STEP_SEC;
              const ms = sec * MS_PER_SEC;
              if (
                ms < visibleRange.start - VISIBLE_RANGE_BUFFER_MS ||
                ms > visibleRange.end + VISIBLE_RANGE_BUFFER_MS
              )
                return null;

              const y = sec * zoom;
              return (
                <g key={sec}>
                  <line
                    x1={0}
                    y1={y}
                    x2={totalWidth}
                    y2={y}
                    stroke="var(--color-border)"
                    strokeWidth={1}
                    opacity={0.35}
                  />
                </g>
              );
            })}

            <DamageLane
              events={damageEvents}
              mitEvents={mitEvents}
              zoom={zoom}
              width={dmgWidth}
              left={dmgX}
              visibleRange={visibleRange}
              onHover={setTooltip}
              lineWidth={lineWidth}
            />
          </svg>

          <div
            className="absolute z-20"
            style={{ left: rulerWidth, width: encounterWidth, top: 0, height: totalHeight }}
          >
            {visibleCasts.map((ev) => {
              const top = (ev.tMs / MS_PER_SEC) * zoom;
              const duration = Math.max(0, ev.duration || 0);
              const height = Math.max(48, (duration / MS_PER_SEC) * zoom);
              const isBegin = ev.type === 'begincast';
              const borderColor = isBegin ? '#a855f7' : '#da3633';
              const labelColor = isBegin ? '#c084fc' : '#da3633';
              return (
                <div
                  key={`${ev.tMs}-${ev.ability.guid}-${ev.type}`}
                  className="absolute left-2 right-2 rounded bg-surface-3 shadow-sm border-l-2 hover:brightness-125 transition-all cursor-help"
                  style={{ top, height, borderColor }}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setTooltip({
                      x: rect.left + rect.width / 2,
                      y: rect.top,
                      items: [
                        {
                          title: ev.ability.name,
                          subtitle: format(new Date(0, 0, 0, 0, 0, 0, ev.tMs), 'mm:ss.SS'),
                          color: labelColor,
                        },
                      ],
                    });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                >
                  <div className="flex h-full flex-col justify-center px-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-white">{ev.ability.name}</span>
                      <span
                        className="text-[9px] font-mono uppercase"
                        style={{ color: labelColor }}
                      >
                        {isBegin ? 'CASTING' : 'CAST'}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[9px] text-muted">
                      {duration > 0
                        ? `${(duration / MS_PER_SEC).toFixed(1)}s Cast`
                        : 'Instant Cast'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div
            id={containerId}
            ref={setMitLaneRef}
            className="absolute z-20"
            style={{ left: mitX, top: 0, width: mitAreaWidth, height: totalHeight }}
          >
            {reprisalGhosts.map(({ mit, targetJob }) => {
              const columnKey = `${mit.skillId}:${targetJob}`;
              const columnIndex = columnMap[columnKey];
              if (columnIndex === undefined) return null;
              const top = (getEffectiveStartMs(mit) / MS_PER_SEC) * zoom;
              const effectHeight = (mit.durationMs / MS_PER_SEC) * zoom;
              const height = 40 + effectHeight;
              const ghostColor = reprisalSkill?.color ?? 'bg-slate-600';
              const reprisalIndex = reprisalZIndexMap.get(mit.id) ?? 0;
              const iconJob = mit.ownerJob ?? targetJob;

              return (
                <div
                  key={`reprisal-ghost-${mit.id}-${targetJob}`}
                  style={{
                    position: 'absolute',
                    top,
                    left: columnIndex * MIT_COLUMN_WIDTH,
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
              const visualOffsetMs = getVisualOffsetMs(mit);

              const top = ((mit.tStartMs + visualOffsetMs) / MS_PER_SEC) * zoom;
              const effectHeight = (mit.durationMs / MS_PER_SEC) * zoom;
              const skillDef = SKILLS.find((s) => s.id === mit.skillId);
              const cooldownMs = (skillDef?.cooldownSec ?? 0) * MS_PER_SEC;
              const cooldownHeight = (cooldownMs / MS_PER_SEC) * zoom;
              const height = 40 + effectHeight + cooldownHeight;
              const columnKey = getMitColumnKey(mit);
              const columnIndex = columnMap[columnKey];
              if (columnIndex === undefined) return null;
              const left = columnIndex * MIT_COLUMN_WIDTH;
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
                    pointerEvents: 'none',
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
                    isSelected={selectedMitIds.includes(mit.id)}
                    onSelect={(mit, e) => {
                      if (e.ctrlKey || e.metaKey) {
                        if (selectedMitIds.includes(mit.id)) {
                          setSelectedMitIds(selectedMitIds.filter((id) => id !== mit.id));
                        } else {
                          setSelectedMitIds([...selectedMitIds, mit.id]);
                        }
                      } else {
                        setSelectedMitIds([mit.id]);
                        if (editingMitId && editingMitId !== mit.id) {
                          setEditingMitId(null);
                        }
                      }
                      setContextMenu(null);
                    }}
                    onRightClick={(e, mit) => {
                      e.stopPropagation();
                      if (!selectedMitIds.includes(mit.id)) {
                        setSelectedMitIds([mit.id]);
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
                      setEditingMitId(selectedMitIds[0]);
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
          onClose={() => {
            setContextMenu(null);
            setSelectedMitIds([]);
          }}
        />
      )}

      {tooltip && (
        <div
          className="fixed z-9999 pointer-events-none min-w-30 rounded-lg border border-app bg-surface-3 text-[11px] text-app shadow-2xl backdrop-blur-xl flex flex-col p-2 animate-[fade-in-up_0.2s_ease]"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {tooltip.items.map((item, idx) => (
            <div
              key={idx}
              className={`flex items-center justify-between gap-3 ${
                idx > 0 ? 'mt-1 border-t border-app pt-1' : ''
              }`}
            >
              <span
                className="min-w-0 flex-1 truncate font-medium leading-none"
                style={{ color: item.color || 'var(--color-text)' }}
              >
                {item.title}
              </span>
              <span className="shrink-0 whitespace-nowrap font-mono text-[10px] leading-none text-muted">
                {item.subtitle}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
