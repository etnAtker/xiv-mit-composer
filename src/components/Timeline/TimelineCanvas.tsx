import { format } from 'date-fns';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { CastEvent, DamageEvent, MitEvent } from '../../model/types';
import { useStore } from '../../store';
import { ContextMenu } from './ContextMenu';
import { DraggableMitigation } from './DraggableMitigation';
import { CastLane, DamageLane } from './TimelineLanes';
import type { TooltipData } from './types';
import { ROW_HEIGHT } from './timelineUtils';
import { MS_PER_SEC } from '../../constants/time';
import { DAMAGE_LANE_HEIGHT, MAX_ZOOM, MIN_ZOOM } from '../../constants/timeline';

const MIT_BAR_HEIGHT = 32;
const VISIBLE_RANGE_BUFFER_MS = 5000;
const ZOOM_WHEEL_STEP = 5;
const RULER_STEP_SEC = 5;

interface Props {
  containerId: string;
  zoom: number;
  setZoom: (value: number) => void;
  durationSec: number;
  totalWidth: number;
  totalHeight: number;
  castHeight: number;
  castY: number;
  dmgY: number;
  mitY: number;
  mitAreaHeight: number;
  castEvents: CastEvent[];
  damageEvents: DamageEvent[];
  mitEvents: MitEvent[];
  cdZones: React.ReactElement[];
  rowMap: Record<string, number>;
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
  castHeight,
  castY,
  dmgY,
  mitY,
  mitAreaHeight,
  castEvents,
  damageEvents,
  mitEvents,
  cdZones,
  rowMap,
  activeDragId,
  dragDeltaMs = 0
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
    endY: 0
  });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const contextMenuElement = document.querySelector(`[data-context-menu-id="${selectedMitIds.join(',')}"]`);
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
    data: { type: 'lane' }
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 10000 });

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollLeft, clientWidth } = scrollRef.current;

    const startSec = scrollLeft / zoom;
    const endSec = (scrollLeft + clientWidth) / zoom;

    const newStart = Math.max(0, (startSec * MS_PER_SEC) - VISIBLE_RANGE_BUFFER_MS);
    const newEnd = (endSec * MS_PER_SEC) + VISIBLE_RANGE_BUFFER_MS;

    setVisibleRange(prev => {
      if (Math.abs(prev.start - newStart) < MS_PER_SEC && Math.abs(prev.end - newEnd) < MS_PER_SEC) {
        return prev;
      }
      return { start: newStart, end: newEnd };
    });
  }, [zoom]);

  useEffect(() => {
    handleScroll();
  }, [zoom, handleScroll]);

  const lineHeight = (mitY - dmgY) + mitAreaHeight;

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-auto relative select-none custom-scrollbar bg-gray-950"
      onScroll={handleScroll}
      onWheel={(e) => {
        if (e.altKey) {
          e.preventDefault();
          const delta = e.deltaY > 0 ? -ZOOM_WHEEL_STEP : ZOOM_WHEEL_STEP;
          const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom + delta));
          setZoom(newZoom);
        }
      }}
    >
      <div
        style={{ width: totalWidth, height: totalHeight, position: 'relative' }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === 'svg' || (e.target as HTMLElement).id === containerId) {
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
              endY: startY
            });

            const handleWindowMouseMove = (wEvent: MouseEvent) => {
              const currentRect = containerEl.getBoundingClientRect();
              setBoxSelection(prev => ({
                ...prev,
                endX: wEvent.clientX - currentRect.left,
                endY: wEvent.clientY - currentRect.top
              }));
            };

            const handleWindowMouseUp = (wEvent: MouseEvent) => {
              window.removeEventListener('mousemove', handleWindowMouseMove);
              window.removeEventListener('mouseup', handleWindowMouseUp);

              const currentRect = containerEl.getBoundingClientRect();
              const endX = wEvent.clientX - currentRect.left;
              const endY = wEvent.clientY - currentRect.top;

              setBoxSelection(prev => {
                const finalSelection = {
                  isActive: false,
                  startX: prev.startX,
                  startY: prev.startY,
                  endX,
                  endY
                };

                const selectionRect = {
                  left: Math.min(finalSelection.startX, finalSelection.endX),
                  top: Math.min(finalSelection.startY, finalSelection.endY),
                  right: Math.max(finalSelection.startX, finalSelection.endX),
                  bottom: Math.max(finalSelection.startY, finalSelection.endY)
                };

                const newlySelectedIds: string[] = [];
                mitEvents.forEach(mit => {
                  const left = (mit.tStartMs / MS_PER_SEC) * zoom;
                  const width = (mit.durationMs / MS_PER_SEC) * zoom;
                  const rowIndex = rowMap[mit.skillId] ?? 0;
                  const top = mitY + (rowIndex * ROW_HEIGHT);
                  const height = MIT_BAR_HEIGHT;

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
                  setSelectedMitIds([
                    ...new Set([...currentSelected, ...newlySelectedIds])
                  ]);
                } else {
                  setSelectedMitIds(newlySelectedIds);
                }

                return {
                  isActive: false,
                  startX: 0,
                  startY: 0,
                  endX: 0,
                  endY: 0
                };
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
              height: Math.abs(boxSelection.endY - boxSelection.startY)
            }}
          />
        )}

        <svg width={totalWidth} height={totalHeight} className="absolute inset-0 block text-xs pointer-events-none">
          <defs>
            <pattern id="diagonalHatch" width="10" height="10" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
              <line x1="0" y1="0" x2="0" y2="10" style={{ stroke: '#EF4444', strokeWidth: 1 }} />
            </pattern>
          </defs>

          <rect x={0} y={castY} width={totalWidth} height={castHeight} fill="rgba(167, 139, 250, 0.05)" />
          <rect x={0} y={dmgY} width={totalWidth} height={DAMAGE_LANE_HEIGHT} fill="rgba(248, 113, 113, 0.05)" />
          <rect x={0} y={mitY} width={totalWidth} height={mitAreaHeight} fill="rgba(52, 211, 153, 0.02)" />

          {Array.from({ length: Math.ceil(durationSec / RULER_STEP_SEC) }).map((_, i) => {
            const sec = i * RULER_STEP_SEC;
            const ms = sec * MS_PER_SEC;
            if (ms < visibleRange.start - VISIBLE_RANGE_BUFFER_MS || ms > visibleRange.end + VISIBLE_RANGE_BUFFER_MS) return null;

            const x = sec * zoom;
            return (
              <g key={sec}>
                <line x1={x} y1={0} x2={x} y2={totalHeight} stroke="#374151" strokeWidth={1} strokeDasharray="4 4" opacity={0.5} />
                <text x={x + 4} y={15} fill="#6B7280" fontSize={10} fontFamily="monospace">
                  {format(new Date(0, 0, 0, 0, 0, sec), 'mm:ss')}
                </text>
              </g>
            );
          })}

          <CastLane events={castEvents} zoom={zoom} height={castHeight} top={castY} visibleRange={visibleRange} onHover={setTooltip} />
          <DamageLane
            events={damageEvents}
            mitEvents={mitEvents}
            zoom={zoom}
            height={DAMAGE_LANE_HEIGHT}
            top={dmgY}
            visibleRange={visibleRange}
            onHover={setTooltip}
            lineHeight={lineHeight}
          />

          <text x={10} y={mitY - 5} fill="#9CA3AF" fontSize={12} fontWeight="bold">减伤 (Mitigation)</text>

          <g transform={`translate(0, ${mitY})`}>
            {cdZones}
          </g>
        </svg>

        <div
          id={containerId}
          ref={setMitLaneRef}
          className="absolute left-0 w-full"
          style={{ top: mitY, height: mitAreaHeight }}
        >
          {mitEvents.map(mit => {
            const isSelected = selectedMitIds.includes(mit.id);
            const visualOffsetMs = (isSelected && mit.id !== activeDragId) ? dragDeltaMs : 0;

            const left = ((mit.tStartMs + visualOffsetMs) / MS_PER_SEC) * zoom;
            const width = (mit.durationMs / MS_PER_SEC) * zoom;
            const rowIndex = rowMap[mit.skillId] ?? 0;
            const top = rowIndex * ROW_HEIGHT;

            const isEditing = editingMitId === mit.id;
            const zIndex = isEditing ? 100 : 10;

            return (
              <div
                key={mit.id}
                style={{ position: 'absolute', top, left: 0, width: '100%', height: MIT_BAR_HEIGHT, zIndex, pointerEvents: 'none' }}
                className={!isEditing ? 'hover:z-20' : ''}
              >
                <DraggableMitigation
                  mit={mit}
                  left={left}
                  width={width}
                  onUpdate={(id, update) => updateMitEvent(id, update)}
                  onRemove={(id) => removeMitEvent(id)}
                  isEditing={isEditing}
                  onEditChange={(val) => setEditingMitId(val ? mit.id : null)}
                  isSelected={selectedMitIds.includes(mit.id)}
                  onSelect={(mit, e) => {
                    if (e.ctrlKey || e.metaKey) {
                      if (selectedMitIds.includes(mit.id)) {
                        setSelectedMitIds(selectedMitIds.filter(id => id !== mit.id));
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

      {contextMenu && selectedMitIds.length > 0 && (
        <ContextMenu
          items={[
            ...(selectedMitIds.length === 1 ? [{
              label: '编辑事件',
              onClick: () => {
                setEditingMitId(selectedMitIds[0]);
                setContextMenu(null);
              }
            }] : []),
            {
              label: selectedMitIds.length === 1 ? '删除' : `删除所选项 (${selectedMitIds.length})`,
              onClick: () => {
                selectedMitIds.forEach(id => removeMitEvent(id));
                setContextMenu(null);
                setSelectedMitIds([]);
              },
              danger: true
            }
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
            transform: 'translate(-50%, -100%)'
          }}
        >
          {tooltip.items.map((item, idx) => (
            <div key={idx} className={`flex items-center justify-between gap-3 ${idx > 0 ? 'mt-1 border-t border-gray-700 pt-1' : ''}`}>
              <span className="font-medium truncate flex-1 min-w-0 leading-none" style={{ color: item.color || '#F3F4F6' }}>
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
