import { normalizeSkillId } from '../../data/skills';
import type { CooldownEvent, MitEvent } from '../../model/types';
import { MS_PER_SEC } from '../../constants/time';

export const MITIGATION_HEADER_HEIGHT = 40;

export interface MitigationBarHeights {
  effectHeight: number;
  cooldownHeight: number;
  totalHeight: number;
}

function buildOwnerKey(ownerId?: number, ownerJob?: MitEvent['ownerJob']) {
  if (typeof ownerId === 'number') return `id:${ownerId}`;
  if (ownerJob) return `job:${ownerJob}`;
  return undefined;
}

function findCooldownEventForMit(mit: MitEvent, cooldownEvents?: CooldownEvent[]) {
  if (!cooldownEvents?.length) return undefined;

  const skillId = normalizeSkillId(mit.skillId);
  const ownerKey = buildOwnerKey(mit.ownerId, mit.ownerJob);

  return cooldownEvents.find((event) => {
    if (event.cdType !== 'cooldown') return false;
    if (event.skillId !== skillId) return false;
    if (ownerKey && event.ownerKey && event.ownerKey !== ownerKey) return false;
    if (!ownerKey && mit.ownerJob && event.ownerJob && event.ownerJob !== mit.ownerJob)
      return false;
    return mit.tStartMs >= event.tStartMs && mit.tStartMs < event.tEndMs;
  });
}

export function getMitigationBarHeights(
  mit: MitEvent,
  zoom: number,
  cooldownEvents?: CooldownEvent[],
): MitigationBarHeights {
  const effectSec = mit.durationMs / MS_PER_SEC;
  const effectHeight = effectSec * zoom - MITIGATION_HEADER_HEIGHT;
  const cooldownEvent = findCooldownEventForMit(mit, cooldownEvents);
  const cooldownHeight = cooldownEvent
    ? (Math.max(cooldownEvent.tEndMs - mit.tEndMs, 0) / MS_PER_SEC) * zoom
    : 0;
  const totalHeight = effectHeight + cooldownHeight + MITIGATION_HEADER_HEIGHT;
  return { effectHeight, cooldownHeight, totalHeight };
}
