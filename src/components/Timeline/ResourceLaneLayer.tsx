import type { ResourceEvent } from '../../model/types';
import { MS_PER_SEC } from '../../constants/time';
import type { TimelineLayout } from './timelineLayout';
import { RESOURCE_COLUMN_WIDTH } from './timelineUtils';
import {
  buildResourceLaneSegments,
  getResourceLevelColor,
  getResourceValueAt,
  shouldShowResourceSegmentValueLabel,
} from './resourceLaneUtils';

interface Props {
  resourceEvents: ResourceEvent[];
  layout: TimelineLayout;
  timelineHeight: number;
  zoom: number;
  visibleStartMs: number;
}

const VALUE_LABEL_HEIGHT = 16;
const VALUE_LABEL_OVERLAP_GAP_PX = 18;

export function ResourceLaneLayer({
  resourceEvents,
  layout,
  timelineHeight,
  zoom,
  visibleStartMs,
}: Props) {
  if (!layout.resourceColumns.length) return null;

  const timelineEndMs = (timelineHeight / zoom) * MS_PER_SEC;

  return (
    <div
      className="absolute left-0 top-0 z-[18] pointer-events-none"
      style={{ width: layout.mitAreaWidth, height: timelineHeight }}
    >
      {layout.resourceColumns.map((column) => {
        const left = layout.resourceColumnLefts[column.columnId];
        if (left === undefined) return null;

        const segments = buildResourceLaneSegments(resourceEvents, column, timelineEndMs);
        const current = getResourceValueAt(segments, visibleStartMs);
        const badgeColor = current
          ? getResourceLevelColor(current.value, current.maxValue)
          : '#3f4652';
        const badgeTop = Math.min(
          Math.max((visibleStartMs / MS_PER_SEC) * zoom + 3, 0),
          timelineHeight - VALUE_LABEL_HEIGHT,
        );

        return (
          <div
            key={column.columnId}
            className="absolute top-0"
            style={{ left, width: RESOURCE_COLUMN_WIDTH, height: timelineHeight }}
          >
            {segments.map((segment) => {
              const top = (segment.tStartMs / MS_PER_SEC) * zoom;
              const end = (segment.tEndMs / MS_PER_SEC) * zoom;
              const height = Math.min(timelineHeight, end) - Math.max(0, top);
              if (height <= 0) return null;

              const color = getResourceLevelColor(segment.value, segment.maxValue);

              return (
                <div
                  key={`${column.columnId}-${segment.tStartMs}-${segment.tEndMs}-${segment.value}`}
                  className="absolute border-b border-black/20"
                  style={{
                    left: 0,
                    top: Math.max(0, top),
                    width: RESOURCE_COLUMN_WIDTH,
                    height,
                    backgroundColor: color,
                    opacity: 0.34,
                  }}
                />
              );
            })}

            {segments.map((segment) => {
              if (
                !shouldShowResourceSegmentValueLabel({
                  segmentStartMs: segment.tStartMs,
                  visibleStartMs,
                  zoom,
                  minDistancePx: VALUE_LABEL_OVERLAP_GAP_PX,
                })
              ) {
                return null;
              }

              const top = (segment.tStartMs / MS_PER_SEC) * zoom + 2;
              if (top >= timelineHeight) return null;

              const color = getResourceLevelColor(segment.value, segment.maxValue);

              return (
                <div
                  key={`${column.columnId}-value-${segment.tStartMs}-${segment.value}`}
                  className="absolute z-[2] flex items-center justify-center rounded-sm border bg-surface-3/90 text-[10px] font-bold leading-none text-app shadow-sm"
                  style={{
                    left: 1,
                    top: Math.min(top, timelineHeight - VALUE_LABEL_HEIGHT),
                    width: RESOURCE_COLUMN_WIDTH - 2,
                    height: VALUE_LABEL_HEIGHT,
                    borderColor: color,
                    boxShadow: `inset 0 0 8px ${color}44`,
                  }}
                  title={`${column.ownerName} ${column.label}: ${segment.value}/${segment.maxValue}`}
                >
                  {segment.value}
                </div>
              );
            })}

            {current && (
              <div
                className="absolute z-[3] flex h-4 items-center justify-center rounded-sm border bg-surface-3 text-[10px] font-bold leading-none text-app shadow-sm"
                style={{
                  top: badgeTop,
                  left: 1,
                  width: RESOURCE_COLUMN_WIDTH - 2,
                  borderColor: badgeColor,
                  boxShadow: `inset 0 0 8px ${badgeColor}55`,
                }}
                title={`${column.ownerName} ${column.label}: ${current.value}/${current.maxValue}`}
              >
                {current.value}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
