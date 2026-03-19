import { normalizeSkillId } from '../../data/skills';
import type { CooldownEvent, Job, MitEvent } from '../../model/types';
import type { TimelineLayout } from './timelineLayout';

function resolveOwnerScopedColumnKey(
  skillId: string,
  ownerJob: Job | undefined,
  columnMap: Record<string, number>,
) {
  const baseSkillId = normalizeSkillId(skillId);
  if (ownerJob) {
    const ownerScopedKey = `${baseSkillId}:${ownerJob}`;
    if (Object.prototype.hasOwnProperty.call(columnMap, ownerScopedKey)) {
      return ownerScopedKey;
    }
  }
  return baseSkillId;
}

export function getMitColumnKey(
  mit: Pick<MitEvent, 'skillId' | 'ownerJob'>,
  layout: TimelineLayout,
) {
  return resolveOwnerScopedColumnKey(
    mit.skillId,
    mit.ownerJob ?? layout.defaultOwnerJob,
    layout.columnMap,
  );
}

export function getCooldownColumnKey(
  cooldownEvent: Pick<CooldownEvent, 'skillId' | 'ownerJob'>,
  layout: TimelineLayout,
) {
  return resolveOwnerScopedColumnKey(
    cooldownEvent.skillId,
    cooldownEvent.ownerJob,
    layout.columnMap,
  );
}
