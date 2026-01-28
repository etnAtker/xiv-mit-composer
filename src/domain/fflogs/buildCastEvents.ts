import type { CastEvent } from '../../model/types';
import { MS_PER_SEC } from '../../constants/time';

export interface EnemyCastLite {
  time: number;
  type: 'cast' | 'begincast';
  actionName: string;
  actionId: number;
  sourceID: number;
  duration?: number;
}

export function buildCastEvents(events: EnemyCastLite[], fightStart: number): CastEvent[] {
  return events
    .map((e) => ({
      timestamp: fightStart + e.time * MS_PER_SEC,
      tMs: e.time * MS_PER_SEC,
      type: e.type,
      sourceID: e.sourceID,
      targetID: 0,
      ability: { guid: e.actionId, name: e.actionName, type: 0 },
      originalActionId: e.actionId,
      isBossEvent: true,
      isFriendly: false,
      originalType: e.type as 'cast' | 'begincast',
      duration: e.duration,
    }))
    .sort((a, b) => a.tMs - b.tMs);
}
