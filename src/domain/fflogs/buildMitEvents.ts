import type { Job, MitEvent, Skill } from '../../model/types';
import { MS_PER_SEC } from '../../constants/time';

export interface FriendlyCastLite {
  time: number;
  actionId: number;
}

export interface FriendlyCastBatch {
  casts: FriendlyCastLite[];
  ownerJob?: Job;
  ownerId?: number;
}

export function buildMitEvents(
  batches: FriendlyCastBatch[],
  getSkillByActionId: (actionId: number) => Skill | undefined,
  resolveSkillId: (skillId: string, ownerJob?: Skill['job']) => string,
): MitEvent[] {
  const events: MitEvent[] = [];

  for (const batch of batches) {
    for (const cast of batch.casts) {
      const skillDef = getSkillByActionId(cast.actionId);
      if (!skillDef) continue;

      const tStartMs = cast.time * MS_PER_SEC;
      const durationMs = skillDef.durationSec * MS_PER_SEC;
      const resolvedSkillId = resolveSkillId(skillDef.id, batch.ownerJob);

      events.push({
        id: crypto.randomUUID(),
        eventType: 'mit',
        ownerId: batch.ownerId,
        ownerJob: batch.ownerJob,
        skillId: resolvedSkillId,
        tStartMs: tStartMs,
        durationMs: durationMs,
        tEndMs: tStartMs + durationMs,
      });
    }
  }

  events.sort((a, b) => a.tStartMs - b.tStartMs);
  return events;
}
