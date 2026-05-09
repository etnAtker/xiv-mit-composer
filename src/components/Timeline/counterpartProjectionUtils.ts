import type { Job, MitEvent } from '../../model/types';
import { getSkillDefinition, normalizeSkillId } from '../../data/skills';
import type { TimelineMemberGroup } from './timelineLayout';
import { buildSkillZIndexMap } from './timelineUtils';

export interface CounterpartProjectionGhost {
  mit: MitEvent;
  targetOwnerId: number;
  targetJob: Job;
}

export function shouldProjectCounterpart(skillId: string) {
  return getSkillDefinition(skillId)?.counterpartProjection === true;
}

export function buildCounterpartProjectionGhosts(
  mitEvents: MitEvent[],
  memberGroups: TimelineMemberGroup[],
): CounterpartProjectionGhost[] {
  return mitEvents.flatMap((mit) => {
    const baseSkillId = normalizeSkillId(mit.skillId);
    const skillDef = getSkillDefinition(mit.skillId);
    if (!skillDef?.counterpartProjection) return [];
    if (typeof mit.ownerId !== 'number') return [];

    return memberGroups
      .filter(
        (group) =>
          !group.collapsed &&
          group.member.playerId !== mit.ownerId &&
          group.skills.some((skill) => skill.id === baseSkillId),
      )
      .map((group) => ({
        mit,
        targetOwnerId: group.member.playerId,
        targetJob: group.member.job,
      }));
  });
}

export function buildCounterpartProjectionZIndexMap(
  mitEvents: MitEvent[],
  getStartMs: (event: MitEvent) => number = (event) => event.tStartMs,
) {
  const projectionSkillIds = new Set(
    mitEvents
      .map((event) => normalizeSkillId(event.skillId))
      .filter((skillId) => shouldProjectCounterpart(skillId)),
  );
  const zIndexMap = new Map<string, number>();

  projectionSkillIds.forEach((skillId) => {
    buildSkillZIndexMap(mitEvents, skillId, getStartMs).forEach((zIndex, eventId) => {
      zIndexMap.set(eventId, zIndex);
    });
  });

  return zIndexMap;
}
