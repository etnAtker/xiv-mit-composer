import { format } from 'date-fns';
import type { CastEvent, GroupedDamageEvent, MitEvent } from '../../model/types';
import { MS_PER_SEC } from '../../constants/time';
import type { TooltipData } from './types';
import { DamageLane, DamageLaneHitTargets } from './TimelineLanes';
import { GRID_LINE_OPACITY } from '../../constants/timeline';

const RULER_STEP_SEC = 5;
const VISIBLE_RANGE_BUFFER_MS = 5000;

interface Props {
  rulerWidth: number;
  castWidth: number;
  damageWidth: number;
  damageLineWidth: number;
  durationSec: number;
  totalHeight: number;
  timelineHeight: number;
  zoom: number;
  visibleRange: { start: number; end: number };
  castEvents: CastEvent[];
  damageEvents: GroupedDamageEvent[];
  mitEvents: MitEvent[];
  onHover: (data: TooltipData | null) => void;
}

export function PinnedTimelineLanes({
  rulerWidth,
  castWidth,
  damageWidth,
  damageLineWidth,
  durationSec,
  totalHeight,
  timelineHeight,
  zoom,
  visibleRange,
  castEvents,
  damageEvents,
  mitEvents,
  onHover,
}: Props) {
  const visibleCasts = castEvents.filter(
    (e) =>
      e.tMs >= visibleRange.start - VISIBLE_RANGE_BUFFER_MS &&
      e.tMs <= visibleRange.end + VISIBLE_RANGE_BUFFER_MS,
  );
  const visibleRulerSeconds = Array.from({ length: Math.ceil(durationSec / RULER_STEP_SEC) })
    .map((_, i) => i * RULER_STEP_SEC)
    .filter((sec) => {
      const ms = sec * MS_PER_SEC;
      return (
        ms >= visibleRange.start - VISIBLE_RANGE_BUFFER_MS &&
        ms <= visibleRange.end + VISIBLE_RANGE_BUFFER_MS
      );
    });
  const visibleGridSeconds = Array.from({ length: Math.ceil(durationSec) })
    .map((_, i) => i)
    .filter((sec) => {
      const ms = sec * MS_PER_SEC;
      return (
        ms >= visibleRange.start - VISIBLE_RANGE_BUFFER_MS &&
        ms <= visibleRange.end + VISIBLE_RANGE_BUFFER_MS
      );
    });

  return (
    <div
      className="sticky left-0 z-30 flex h-full"
      style={{ width: rulerWidth + castWidth + damageWidth, height: totalHeight }}
    >
      <div
        className="relative border-r border-app bg-surface-2 pr-2 text-right pointer-events-none"
        style={{ width: rulerWidth, height: timelineHeight }}
      >
        <svg
          width={rulerWidth}
          height={timelineHeight}
          className="absolute left-0 top-0 block pointer-events-none"
        >
          {visibleRulerSeconds.map((sec) => {
            if (sec === 0) return null;
            const y = sec * zoom;
            return (
              <line
                key={`r-line-${sec}`}
                x1={0}
                y1={y}
                x2={rulerWidth}
                y2={y}
                stroke="var(--color-border)"
                strokeWidth={1}
                opacity={GRID_LINE_OPACITY}
              />
            );
          })}
        </svg>
        <div className="relative h-full py-4">
          {visibleRulerSeconds.map((sec) => {
            const y = sec * zoom;
            return (
              <div
                key={`r-${sec}`}
                className="absolute left-4 text-[10px] font-mono text-muted"
                style={{ top: y + 6 }}
              >
                {format(new Date(0, 0, 0, 0, 0, sec), 'mm:ss')}
              </div>
            );
          })}
        </div>
      </div>

      <div className="relative h-full border-r border-app bg-surface" style={{ width: castWidth }}>
        <svg
          width={castWidth}
          height={timelineHeight}
          className="absolute left-0 top-0 block pointer-events-none"
        >
          {visibleGridSeconds.map((sec) => {
            if (sec === 0) return null;
            const y = sec * zoom;
            return (
              <line
                key={`cast-grid-${sec}`}
                x1={0}
                y1={y}
                x2={castWidth}
                y2={y}
                stroke="var(--color-border)"
                strokeWidth={1}
                opacity={GRID_LINE_OPACITY}
              />
            );
          })}
        </svg>
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
              className="absolute left-2 right-2 rounded bg-surface-3 shadow-sm border-l-2 hover:brightness-125 transition-all cursor-help pointer-events-auto"
              style={{ top, height, borderColor }}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                onHover({
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
              onMouseLeave={() => onHover(null)}
            >
              <div className="flex h-full flex-col justify-center px-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-app">{ev.ability.name}</span>
                  <span className="text-[9px] font-mono uppercase" style={{ color: labelColor }}>
                    {isBegin ? 'CASTING' : 'CAST'}
                  </span>
                </div>
                <div className="mt-0.5 text-[9px] text-muted">
                  {duration > 0 ? `${(duration / MS_PER_SEC).toFixed(1)}s Cast` : 'Instant Cast'}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="relative h-full border-r border-app bg-surface-2"
        style={{ width: damageWidth }}
      >
        <svg
          width={damageWidth}
          height={timelineHeight}
          className="absolute left-0 top-0 block pointer-events-none"
        >
          {visibleGridSeconds.map((sec) => {
            if (sec === 0) return null;
            const y = sec * zoom;
            return (
              <line
                key={`damage-grid-${sec}`}
                x1={0}
                y1={y}
                x2={damageWidth}
                y2={y}
                stroke="var(--color-border)"
                strokeWidth={1}
                opacity={GRID_LINE_OPACITY}
              />
            );
          })}
        </svg>
        <svg
          width={damageLineWidth}
          height={timelineHeight}
          className="absolute left-0 top-0 block text-xs pointer-events-none"
        >
          <DamageLane
            events={damageEvents}
            mitEvents={mitEvents}
            zoom={zoom}
            width={damageWidth}
            left={0}
            visibleRange={visibleRange}
            lineWidth={damageLineWidth}
          />
        </svg>

        <DamageLaneHitTargets
          events={damageEvents}
          mitEvents={mitEvents}
          zoom={zoom}
          width={damageWidth}
          left={0}
          visibleRange={visibleRange}
          onHover={onHover}
        />
      </div>
    </div>
  );
}
