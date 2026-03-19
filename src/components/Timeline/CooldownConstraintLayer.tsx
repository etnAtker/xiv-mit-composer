import type { CooldownEvent, MitEvent } from '../../model/types';
import { MS_PER_SEC } from '../../constants/time';
import type { TimelineLayout } from './timelineLayout';
import { MIT_COLUMN_PADDING, MIT_COLUMN_WIDTH } from './timelineUtils';
import { buildConstraintSegments } from './cooldownConstraintUtils';

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

const COOLDOWN_STYLE = {
  backgroundColor: 'var(--color-surface)',
  stripeColor: 'var(--color-cooldown-hatch)',
  borderColor: 'var(--color-border)',
  boxShadow: 'inset 0 0 10px var(--color-cooldown-shadow)',
} as const;

export function CooldownConstraintLayer({
  cooldownEvents,
  mitEvents,
  layout,
  timelineHeight,
  zoom,
  getMitColumnLeft,
}: Props) {
  const segments = buildConstraintSegments(cooldownEvents, mitEvents, layout);

  return (
    <div
      className="absolute z-[15] pointer-events-none"
      style={{ left: 0, top: 0, width: layout.mitAreaWidth, height: timelineHeight }}
    >
      {segments.map((segment, index) => {
        const style = segment.cdType === 'cooldown' ? COOLDOWN_STYLE : UNUSABLE_STYLE;
        const columnKey = segment.columnKey;
        const columnIndex = layout.columnMap[columnKey];
        if (columnIndex === undefined) return null;

        const startY = (segment.startMs / MS_PER_SEC) * zoom;
        const endY = (segment.endMs / MS_PER_SEC) * zoom;
        const clippedTop = Math.max(0, startY);
        const clippedBottom = Math.min(timelineHeight, endY);
        const height = clippedBottom - clippedTop;
        if (height <= 0) return null;

        const left = getMitColumnLeft(columnIndex) + MIT_COLUMN_PADDING;
        const width = MIT_COLUMN_WIDTH - MIT_COLUMN_PADDING * 2;

        return (
          <div
            key={`${segment.skillId}-${segment.ownerKey ?? segment.ownerJob ?? 'all'}-${segment.cdType}-${segment.startMs}-${segment.endMs}-${index}`}
            className="absolute overflow-hidden"
            style={{
              top: clippedTop,
              left,
              width,
              height,
              backgroundColor: style.backgroundColor,
              backgroundImage: `repeating-linear-gradient(45deg, ${style.stripeColor}, ${style.stripeColor} 4px, transparent 4px, transparent 8px)`,
              boxShadow: 'boxShadow' in style ? style.boxShadow : undefined,
            }}
          >
            <div
              className="absolute right-0 top-0 h-full w-[2px]"
              style={{ backgroundColor: style.borderColor }}
            />
          </div>
        );
      })}
    </div>
  );
}
