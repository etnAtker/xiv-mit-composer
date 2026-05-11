import type { ResourceEvent } from '../../model/types';
import { MS_PER_SEC } from '../../constants/time';
import type { TimelineResourceColumn } from './types';

export interface ResourceLaneSegment {
  value: number;
  maxValue: number;
  tStartMs: number;
  tEndMs: number;
}

const RESOURCE_COLORS = {
  empty: '#3f4652',
  one: '#2563eb',
  two: '#0891b2',
  three: '#16a34a',
  four: '#ca8a04',
  full: '#dc2626',
};

export function getResourceLevelColor(value: number, maxValue: number) {
  if (value <= 0) return RESOURCE_COLORS.empty;
  if (value >= maxValue) return RESOURCE_COLORS.full;
  if (value === 1) return RESOURCE_COLORS.one;
  if (value === 2) return RESOURCE_COLORS.two;
  if (value === 3) return RESOURCE_COLORS.three;
  return RESOURCE_COLORS.four;
}

export function buildResourceLaneSegments(
  events: ResourceEvent[],
  column: TimelineResourceColumn,
  timelineEndMs: number,
): ResourceLaneSegment[] {
  const ownerKey = `id:${column.ownerId}`;
  const sorted = events
    .filter((event) => event.resourceGroupId === column.id && event.ownerKey === ownerKey)
    .slice()
    .sort((a, b) => a.tStartMs - b.tStartMs || a.tEndMs - b.tEndMs);

  if (!sorted.length) {
    return [
      { value: column.maxValue, maxValue: column.maxValue, tStartMs: 0, tEndMs: timelineEndMs },
    ];
  }

  const segments: ResourceLaneSegment[] = [];
  let cursor = 0;
  let currentValue = column.maxValue;
  let currentMaxValue = column.maxValue;

  for (const event of sorted) {
    const startMs = Math.max(0, event.tStartMs);
    const endMs = Math.max(startMs, event.tEndMs);

    if (startMs > cursor) {
      segments.push({
        value: currentValue,
        maxValue: currentMaxValue,
        tStartMs: cursor,
        tEndMs: Math.min(startMs, timelineEndMs),
      });
    }

    if (endMs > startMs) {
      segments.push({
        value: event.value,
        maxValue: event.maxValue,
        tStartMs: startMs,
        tEndMs: Math.min(endMs, timelineEndMs),
      });
      cursor = Math.max(cursor, endMs);
    }

    currentValue = event.value;
    currentMaxValue = event.maxValue;
    cursor = Math.max(cursor, endMs);
  }

  if (cursor < timelineEndMs) {
    segments.push({
      value: currentValue,
      maxValue: currentMaxValue,
      tStartMs: cursor,
      tEndMs: timelineEndMs,
    });
  }

  return segments.filter((segment) => segment.tEndMs > segment.tStartMs);
}

export function getResourceValueAt(segments: ResourceLaneSegment[], tMs: number) {
  if (!segments.length) return null;

  let latest = segments[0];
  for (const segment of segments) {
    if (segment.tStartMs <= tMs && tMs < segment.tEndMs) return segment;
    if (segment.tStartMs <= tMs) latest = segment;
  }

  return latest;
}

export function shouldShowResourceSegmentValueLabel({
  segmentStartMs,
  visibleStartMs,
  zoom,
  minDistancePx,
}: {
  segmentStartMs: number;
  visibleStartMs: number;
  zoom: number;
  minDistancePx: number;
}) {
  if (segmentStartMs <= 0) return false;

  const segmentTopPx = (segmentStartMs / MS_PER_SEC) * zoom;
  const currentBadgeTopPx = (visibleStartMs / MS_PER_SEC) * zoom;
  return Math.abs(segmentTopPx - currentBadgeTopPx) >= minDistancePx;
}
