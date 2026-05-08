import { normalizeSkillId } from '../../data/skills';
import type { CooldownEvent, Job, MitEvent } from '../../model/types';
import type { TimelineLayout } from './timelineLayout';

function resolveOwnerScopedColumnKey(
  skillId: string,
  ownerId: number | undefined,
  ownerJob: Job | undefined,
  columnMap: Record<string, number>,
) {
  const baseSkillId = normalizeSkillId(skillId);
  if (typeof ownerId === 'number') {
    const ownerScopedKey = `${baseSkillId}:${ownerId}`;
    if (Object.prototype.hasOwnProperty.call(columnMap, ownerScopedKey)) {
      return ownerScopedKey;
    }
  }
  if (ownerJob) {
    const ownerScopedKey = `${baseSkillId}:${ownerJob}`;
    if (Object.prototype.hasOwnProperty.call(columnMap, ownerScopedKey)) {
      return ownerScopedKey;
    }
  }
  return baseSkillId;
}

export function getMitColumnKey(
  mit: Pick<MitEvent, 'skillId' | 'ownerJob' | 'ownerId'>,
  layout: TimelineLayout,
) {
  return resolveOwnerScopedColumnKey(
    mit.skillId,
    mit.ownerId ?? layout.defaultOwnerId,
    mit.ownerJob ?? layout.defaultOwnerJob,
    layout.columnMap,
  );
}

export function getCooldownColumnKey(
  cooldownEvent: Pick<CooldownEvent, 'skillId' | 'ownerJob' | 'ownerKey'>,
  layout: TimelineLayout,
) {
  const ownerId = cooldownEvent.ownerKey?.startsWith('id:')
    ? Number(cooldownEvent.ownerKey.slice(3))
    : undefined;
  return resolveOwnerScopedColumnKey(
    cooldownEvent.skillId,
    Number.isFinite(ownerId) ? ownerId : undefined,
    cooldownEvent.ownerJob,
    layout.columnMap,
  );
}
