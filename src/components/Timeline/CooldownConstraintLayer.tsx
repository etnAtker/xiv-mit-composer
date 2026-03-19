import type { CooldownEvent, MitEvent } from '../../model/types';
import { MS_PER_SEC } from '../../constants/time';
import type { TimelineLayout } from './timelineLayout';
import { getCooldownColumnKey, getMitColumnKey } from './mitigationColumnUtils';
import { MIT_COLUMN_PADDING, MIT_COLUMN_WIDTH } from './timelineUtils';

interface Props {
  cooldownEvents: CooldownEvent[];
  mitEvents: MitEvent[];
  layout: TimelineLayout;
  timelineHeight: number;
  zoom: number;
  getMitColumnLeft: (columnIndex: number) => number;
}

const UNUSABLE_STYLE = {
  backgroundColor: 'rgba(245, 158, 11, 0.10)',
  stripeColor: 'rgba(245, 158, 11, 0.32)',
  borderColor: 'rgba(251, 191, 36, 0.80)',
} as const;

function subtractRanges(
  sourceStartMs: number,
  sourceEndMs: number,
  blockers: Array<{ startMs: number; endMs: number }>,
) {
  if (!blockers.length) {
    return [{ startMs: sourceStartMs, endMs: sourceEndMs }];
  }

  const sorted = blockers
    .filter((range) => range.endMs > sourceStartMs && range.startMs < sourceEndMs)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  const segments: Array<{ startMs: number; endMs: number }> = [];
  let cursor = sourceStartMs;

  for (const range of sorted) {
    const startMs = Math.max(range.startMs, sourceStartMs);
    const endMs = Math.min(range.endMs, sourceEndMs);
    if (endMs <= cursor) continue;
    if (startMs > cursor) {
      segments.push({ startMs: cursor, endMs: startMs });
    }
    cursor = Math.max(cursor, endMs);
    if (cursor >= sourceEndMs) break;
  }

  if (cursor < sourceEndMs) {
    segments.push({ startMs: cursor, endMs: sourceEndMs });
  }

  return segments;
}

export function CooldownConstraintLayer({
  cooldownEvents,
  mitEvents,
  layout,
  timelineHeight,
  zoom,
  getMitColumnLeft,
}: Props) {
  return (
    <div
      className="absolute z-[15] pointer-events-none"
      style={{ left: 0, top: 0, width: layout.mitAreaWidth, height: timelineHeight }}
    >
      {cooldownEvents.map((event) => {
        if (event.cdType !== 'unusable') return null;

        const columnKey = getCooldownColumnKey(event, layout);
        const columnIndex = layout.columnMap[columnKey];
        if (columnIndex === undefined) return null;

        const startY = (event.tStartMs / MS_PER_SEC) * zoom;
        const endY = (event.tEndMs / MS_PER_SEC) * zoom;
        const clippedTop = Math.max(0, startY);
        const clippedBottom = Math.min(timelineHeight, endY);
        const height = clippedBottom - clippedTop;
        if (height <= 0) return null;

        const left = getMitColumnLeft(columnIndex) + MIT_COLUMN_PADDING;
        const width = MIT_COLUMN_WIDTH - MIT_COLUMN_PADDING * 2;
        const effectRanges = mitEvents
          .filter((mit) => getMitColumnKey(mit, layout) === columnKey)
          .map((mit) => ({ startMs: mit.tStartMs, endMs: mit.tEndMs }));
        const visibleSegments = subtractRanges(event.tStartMs, event.tEndMs, effectRanges);

        return visibleSegments.map((segment, index) => {
          const segmentTop = Math.max(0, (segment.startMs / MS_PER_SEC) * zoom);
          const segmentBottom = Math.min(timelineHeight, (segment.endMs / MS_PER_SEC) * zoom);
          const segmentHeight = segmentBottom - segmentTop;
          if (segmentHeight <= 0) return null;

          return (
            <div
              key={`${event.skillId}-${event.ownerKey ?? event.ownerJob ?? 'all'}-${event.cdType}-${event.tStartMs}-${index}`}
              className="absolute overflow-hidden"
              style={{
                top: segmentTop,
                left,
                width,
                height: segmentHeight,
                backgroundColor: UNUSABLE_STYLE.backgroundColor,
                backgroundImage: `repeating-linear-gradient(45deg, ${UNUSABLE_STYLE.stripeColor}, ${UNUSABLE_STYLE.stripeColor} 4px, transparent 4px, transparent 8px)`,
              }}
            >
              <div
                className="absolute right-0 top-0 h-full w-[2px]"
                style={{ backgroundColor: UNUSABLE_STYLE.borderColor }}
              />
            </div>
          );
        });
      })}
    </div>
  );
}
