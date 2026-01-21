import { format } from 'date-fns';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { CastEvent, DamageEvent, MitEvent } from '../../model/types';
import { useStore } from '../../store';
import { ContextMenu } from './ContextMenu';
import { DraggableMitigation } from './DraggableMitigation';
import { CastLane, DamageLane } from './TimelineLanes';
import type { TooltipData } from './types';
import { MIT_COLUMN_PADDING, MIT_COLUMN_WIDTH } from './timelineUtils';
import { MS_PER_SEC } from '../../constants/time';
import { MAX_ZOOM, MIN_ZOOM } from '../../constants/timeline';

const VISIBLE_RANGE_BUFFER_MS = 5000;
const ZOOM_WHEEL_STEP = 5;
const RULER_STEP_SEC = 5;
const HEADER_HEIGHT = 36;

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
  skillColumns: { id: string; name: string }[];
  castEvents: CastEvent[];
  damageEvents: DamageEvent[];
  mitEvents: MitEvent[];
  cdZones: React.ReactElement[];
  columnMap: Record<string, number>;
  activeDragId?: string | null;
  dragDeltaMs?: number;
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
  cdZones,
  columnMap,
  activeDragId,
  dragDeltaMs = 0,
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

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const contextMenuElement = document.querySelector(
        `[data-context-menu-id="${selectedMitIds.join(',')}"]`,
      );
      if (contextMenuElement && !contextMenuElement.contains(e.target as Node)) {
        setContextMenu(null);
        setSelectedMitIds([]);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [selectedMitIds, setSelectedMitIds]);

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
  const headerSkillColumns =
    skillColumns.length > 0 ? skillColumns : [{ id: 'mit-placeholder', name: '减伤' }];
  const headerColumns = [
    { key: 'ruler', label: '时间', width: rulerWidth, isSkill: false },
    { key: 'cast', label: '读条', width: castWidth, isSkill: false },
    { key: 'damage', label: '承伤', width: dmgWidth, isSkill: false },
    ...headerSkillColumns.map((skill) => ({
      key: `skill-${skill.id}`,
      label: skill.name,
      width: MIT_COLUMN_WIDTH,
      isSkill: true,
    })),
  ];

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-auto relative select-none custom-scrollbar bg-gray-950"
      onScroll={handleScroll}
    >
      <div style={{ width: totalWidth, height: totalHeight + HEADER_HEIGHT, position: 'relative' }}>
        <div
          className="sticky top-0 z-30 flex bg-gray-950/95 backdrop-blur border-b border-gray-800"
          style={{ width: totalWidth, height: HEADER_HEIGHT }}
        >
          {headerColumns.map((col) => (
            <div
              key={col.key}
              className={`flex items-center justify-center px-2 border-r border-gray-800 ${
                col.isSkill
                  ? 'text-xs text-gray-200 font-semibold'
                  : 'text-[11px] text-gray-400 font-semibold uppercase tracking-wider'
              }`}
              style={{ width: col.width }}
              title={col.label}
            >
              <span className="truncate">{col.label}</span>
            </div>
          ))}
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
                  const columnIndex = columnMap[mit.skillId] ?? 0;
                  const left = mitX + columnIndex * MIT_COLUMN_WIDTH + MIT_COLUMN_PADDING;
                  const top = (mit.tStartMs / MS_PER_SEC) * zoom;
                  const width = barWidth;
                  const height = (mit.durationMs / MS_PER_SEC) * zoom;

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
              className="absolute border-2 border-dashed border-blue-400 bg-blue-400/10 z-50 pointer-events-none"
              style={{
                left: Math.min(boxSelection.startX, boxSelection.endX),
                top: Math.min(boxSelection.startY, boxSelection.endY),
                width: Math.abs(boxSelection.endX - boxSelection.startX),
                height: Math.abs(boxSelection.endY - boxSelection.startY),
              }}
            />
          )}

          <svg
            width={totalWidth}
            height={totalHeight}
            className="absolute inset-0 block text-xs pointer-events-none"
          >
            <defs>
              <pattern
                id="diagonalHatchCooldown"
                width="10"
                height="10"
                patternTransform="rotate(45 0 0)"
                patternUnits="userSpaceOnUse"
              >
                <line x1="0" y1="0" x2="0" y2="10" style={{ stroke: '#EF4444', strokeWidth: 1 }} />
              </pattern>
              <pattern
                id="diagonalHatchUnusable"
                width="10"
                height="10"
                patternTransform="rotate(45 0 0)"
                patternUnits="userSpaceOnUse"
              >
                <line x1="0" y1="0" x2="0" y2="10" style={{ stroke: '#F59E0B', strokeWidth: 1 }} />
              </pattern>
            </defs>

            <rect
              x={0}
              y={0}
              width={rulerWidth}
              height={totalHeight}
              fill="rgba(17, 24, 39, 0.4)"
            />
            <rect
              x={castX}
              y={0}
              width={castWidth}
              height={totalHeight}
              fill="rgba(167, 139, 250, 0.05)"
            />
            <rect
              x={dmgX}
              y={0}
              width={dmgWidth}
              height={totalHeight}
              fill="rgba(248, 113, 113, 0.05)"
            />
            <rect
              x={mitX}
              y={0}
              width={mitAreaWidth}
              height={totalHeight}
              fill="rgba(52, 211, 153, 0.02)"
            />

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
                    stroke="#374151"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                    opacity={0.5}
                  />
                  <text x={8} y={y + 12} fill="#6B7280" fontSize={10} fontFamily="monospace">
                    {format(new Date(0, 0, 0, 0, 0, sec), 'mm:ss')}
                  </text>
                </g>
              );
            })}

            <CastLane
              events={castEvents}
              zoom={zoom}
              width={castWidth}
              left={castX}
              visibleRange={visibleRange}
              onHover={setTooltip}
            />
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

            <g transform={`translate(${mitX}, 0)`}>{cdZones}</g>
          </svg>

          <div
            id={containerId}
            ref={setMitLaneRef}
            className="absolute"
            style={{ left: mitX, top: 0, width: mitAreaWidth, height: totalHeight }}
          >
            {mitEvents.map((mit) => {
              const isSelected = selectedMitIds.includes(mit.id);
              const visualOffsetMs = isSelected && mit.id !== activeDragId ? dragDeltaMs : 0;

              const top = ((mit.tStartMs + visualOffsetMs) / MS_PER_SEC) * zoom;
              const height = (mit.durationMs / MS_PER_SEC) * zoom;
              const columnIndex = columnMap[mit.skillId] ?? 0;
              const left = columnIndex * MIT_COLUMN_WIDTH;
              const barWidth = MIT_COLUMN_WIDTH - MIT_COLUMN_PADDING * 2;

              const isEditing = editingMitId === mit.id;
              const zIndex = isEditing ? 100 : 10;

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
          onClose={() => setContextMenu(null)}
        />
      )}

      {tooltip && (
        <div
          className="fixed z-[9999] pointer-events-none bg-gray-900/95 border border-gray-700 text-white text-xs rounded shadow-xl flex flex-col p-2 min-w-[120px]"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {tooltip.items.map((item, idx) => (
            <div
              key={idx}
              className={`flex items-center justify-between gap-3 ${idx > 0 ? 'mt-1 border-t border-gray-700 pt-1' : ''}`}
            >
              <span
                className="font-medium truncate flex-1 min-w-0 leading-none"
                style={{ color: item.color || '#F3F4F6' }}
              >
                {item.title}
              </span>
              <span className="text-gray-400 font-mono text-[10px] whitespace-nowrap leading-none shrink-0">
                {item.subtitle}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
