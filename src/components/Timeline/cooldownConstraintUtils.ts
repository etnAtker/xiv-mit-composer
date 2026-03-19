import type { CooldownEvent, MitEvent } from '../../model/types';
import type { TimelineLayout } from './timelineLayout';
import { getCooldownColumnKey, getMitColumnKey } from './mitigationColumnUtils';

export interface TimeRange {
  startMs: number;
  endMs: number;
}

export interface ConstraintSegment extends TimeRange {
  cdType: CooldownEvent['cdType'];
  skillId: string;
  ownerJob?: CooldownEvent['ownerJob'];
  ownerKey?: string;
  columnKey: string;
}

export function subtractRanges(sourceStartMs: number, sourceEndMs: number, blockers: TimeRange[]) {
  if (!blockers.length) {
    return [{ startMs: sourceStartMs, endMs: sourceEndMs }];
  }

  const sorted = blockers
    .filter((range) => range.endMs > sourceStartMs && range.startMs < sourceEndMs)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  const segments: TimeRange[] = [];
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

function buildEffectRangesByColumn(mitEvents: MitEvent[], layout: TimelineLayout) {
  const effectRangesByColumn = new Map<string, TimeRange[]>();

  for (const mit of mitEvents) {
    const columnKey = getMitColumnKey(mit, layout);
    const ranges = effectRangesByColumn.get(columnKey) ?? [];
    ranges.push({ startMs: mit.tStartMs, endMs: mit.tEndMs });
    effectRangesByColumn.set(columnKey, ranges);
  }

  return effectRangesByColumn;
}

export function buildConstraintSegments(
  cooldownEvents: CooldownEvent[],
  mitEvents: MitEvent[],
  layout: TimelineLayout,
) {
  const effectRangesByColumn = buildEffectRangesByColumn(mitEvents, layout);
  const segments: ConstraintSegment[] = [];

  for (const event of cooldownEvents) {
    const columnKey = getCooldownColumnKey(event, layout);
    const blockers = effectRangesByColumn.get(columnKey) ?? [];
    const visibleSegments = subtractRanges(event.tStartMs, event.tEndMs, blockers);

    for (const segment of visibleSegments) {
      if (segment.endMs <= segment.startMs) continue;
      segments.push({
        cdType: event.cdType,
        skillId: event.skillId,
        ownerJob: event.ownerJob,
        ownerKey: event.ownerKey,
        columnKey,
        startMs: segment.startMs,
        endMs: segment.endMs,
      });
    }
  }

  return segments;
}
