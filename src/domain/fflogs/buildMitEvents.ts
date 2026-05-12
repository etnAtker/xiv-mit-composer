import type { Job, MitEvent, Skill } from '../../model/types';
import { MS_PER_SEC } from '../../constants/time';
import { normalizeSkillId } from '../../data/skills';

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
      if (applyDurationEndFromCast(skillDef, tStartMs, events, batch)) {
        continue;
      }

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

function applyDurationEndFromCast(
  skillDef: Skill,
  tMs: number,
  events: MitEvent[],
  batch: FriendlyCastBatch,
): boolean {
  const parentSkillIds = new Set<string>();
  if (skillDef.durationEnder?.parentSkillId) {
    parentSkillIds.add(skillDef.durationEnder.parentSkillId);
  }
  if (skillDef.durationEnd?.allowSelfRecast) {
    parentSkillIds.add(skillDef.id);
  }
  if (!parentSkillIds.size) return false;

  let parent: MitEvent | null = null;
  for (const event of events) {
    if (event.ownerId !== batch.ownerId || event.ownerJob !== batch.ownerJob) continue;
    const parentSkillId = normalizeSkillId(event.skillId);
    if (!parentSkillIds.has(parentSkillId)) continue;
    if (tMs <= event.tStartMs || tMs > event.tEndMs) continue;
    if (!parent || event.tStartMs > parent.tStartMs) {
      parent = event;
    }
  }

  if (!parent) return skillDef.kind === 'durationEnder';

  parent.durationMs = tMs - parent.tStartMs;
  parent.tEndMs = tMs;
  parent.endedBy = {
    skillId: skillDef.id,
    tMs,
  };
  return true;
}
