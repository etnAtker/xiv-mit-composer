import type { CooldownEvent } from '../../model/types';
import { MS_PER_SEC } from '../../constants/time';
import type { TimelineLayout } from './timelineLayout';
import { getCooldownColumnKey } from './mitigationColumnUtils';
import { MIT_COLUMN_PADDING, MIT_COLUMN_WIDTH } from './timelineUtils';

interface Props {
  cooldownEvents: CooldownEvent[];
  layout: TimelineLayout;
  timelineHeight: number;
  zoom: number;
  getMitColumnLeft: (columnIndex: number) => number;
}

const CONSTRAINT_STYLES = {
  cooldown: {
    backgroundColor: 'rgba(239, 68, 68, 0.10)',
    stripeColor: 'rgba(239, 68, 68, 0.30)',
    borderColor: 'rgba(248, 113, 113, 0.90)',
  },
  unusable: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    stripeColor: 'rgba(245, 158, 11, 0.34)',
    borderColor: 'rgba(251, 191, 36, 0.95)',
  },
} as const;

export function CooldownConstraintLayer({
  cooldownEvents,
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
        const columnKey = getCooldownColumnKey(event, layout);
        const columnIndex = layout.columnMap[columnKey];
        if (columnIndex === undefined) return null;

        const startY = (event.tStartMs / MS_PER_SEC) * zoom;
        const endY = (event.tEndMs / MS_PER_SEC) * zoom;
        const clippedTop = Math.max(0, startY);
        const clippedBottom = Math.min(timelineHeight, endY);
        const height = clippedBottom - clippedTop;
        if (height <= 0) return null;

        const style = CONSTRAINT_STYLES[event.cdType];
        const left = getMitColumnLeft(columnIndex) + MIT_COLUMN_PADDING;
        const width = MIT_COLUMN_WIDTH - MIT_COLUMN_PADDING * 2;

        return (
          <div
            key={`${event.skillId}-${event.ownerKey ?? event.ownerJob ?? 'all'}-${event.cdType}-${event.tStartMs}`}
            className="absolute overflow-hidden border-x"
            style={{
              top: clippedTop,
              left,
              width,
              height,
              borderColor: style.borderColor,
              backgroundColor: style.backgroundColor,
              backgroundImage: `repeating-linear-gradient(45deg, ${style.stripeColor}, ${style.stripeColor} 4px, transparent 4px, transparent 8px)`,
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
