import { format } from 'date-fns';
import type { CastEvent } from '../../model/types';
import { MS_PER_SEC } from '../../constants/time';
import type { TooltipData } from './types';

const RULER_STEP_SEC = 5;
const VISIBLE_RANGE_BUFFER_MS = 5000;

interface Props {
  rulerWidth: number;
  castWidth: number;
  durationSec: number;
  totalHeight: number;
  zoom: number;
  visibleRange: { start: number; end: number };
  castEvents: CastEvent[];
  onHover: (data: TooltipData | null) => void;
}

export function PinnedTimelineLanes({
  rulerWidth,
  castWidth,
  durationSec,
  totalHeight,
  zoom,
  visibleRange,
  castEvents,
  onHover,
}: Props) {
  const visibleCasts = castEvents.filter(
    (e) =>
      e.tMs >= visibleRange.start - VISIBLE_RANGE_BUFFER_MS &&
      e.tMs <= visibleRange.end + VISIBLE_RANGE_BUFFER_MS,
  );

  return (
    <div
      className="sticky left-0 z-20 flex h-full"
      style={{ width: rulerWidth + castWidth, height: totalHeight }}
    >
      <div
        className="h-full border-r border-app bg-surface-2 pr-2 text-right pointer-events-none"
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

      <div
        className="relative h-full border-r border-app bg-surface"
        style={{
          width: castWidth,
          backgroundSize: '100% 60px',
          backgroundImage: 'linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)',
        }}
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
    </div>
  );
}
