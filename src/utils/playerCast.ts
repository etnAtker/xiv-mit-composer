import { getSkillDefinition, normalizeSkillId } from '../data/skills';
import type { CooldownEvent, Job, MitEvent } from '../model/types';
import { buildBoundaries } from './playerCastBoundaries';
import { buildCooldownEvents } from './playerCastCooldownEvents';
import {
  type BuildMode,
  CooldownBuildError,
  type CooldownBuildResult,
  type MitigationStateResult,
  type PlayerCastState,
  buildOwnerKey,
  sortMitEvents,
} from './playerCastShared';
import { buildStackEvents } from './playerCastStackEvents';

export type {
  CooldownBuildFailure,
  CooldownBuildResult,
  CooldownBuildSuccess,
  MitigationStateFailure,
  MitigationStateResult,
  MitigationStateSuccess,
  PlayerCastState,
} from './playerCastShared';

export function buildCooldownsStrict(events: MitEvent[]): CooldownBuildResult {
  try {
    return { ok: true, ...buildPlayerCastStateInternal(events, 'strict') };
  } catch (error) {
    if (error instanceof CooldownBuildError) {
      return {
        ok: false,
        code: error.code,
        message: error.message,
      };
    }
    throw error;
  }
}

export function buildCooldownsTolerant(events: MitEvent[]): CooldownEvent[] {
  return buildPlayerCastStateTolerant(events).cooldownEvents;
}

export function buildPlayerCastStateTolerant(events: MitEvent[]): PlayerCastState {
  return buildPlayerCastStateInternal(events, 'tolerant');
}

export function evaluateMitigationSetStrict(events: MitEvent[]): MitigationStateResult {
  const mitEvents = sortMitEvents(events);
  const cooldownResult = buildCooldownsStrict(mitEvents);
  if (!cooldownResult.ok) {
    return cooldownResult;
  }

  return {
    ok: true,
    mitEvents,
    cooldownEvents: cooldownResult.cooldownEvents,
    resourceEvents: cooldownResult.resourceEvents,
  };
}

export function tryBuildCooldowns(events: MitEvent[]): CooldownEvent[] | void {
  return buildCooldownsTolerant(events);
}

export function canInsertMitigation(
  skillId: string,
  startMs: number,
  allEvents: MitEvent[],
  ownerJob?: Job,
  ownerId?: number,
  excludeIds?: Set<string>,
  cooldownEvents?: CooldownEvent[],
): boolean {
  const baseSkillId = normalizeSkillId(skillId);
  const skillMeta = getSkillDefinition(baseSkillId);
  if (!skillMeta) {
    console.error(`错误：未找到技能 ${baseSkillId} 的定义。`);
    return false;
  }

  let resolvedCooldownEvents = cooldownEvents;
  if (!resolvedCooldownEvents) {
    const filteredEvents =
      excludeIds && excludeIds.size
        ? allEvents.filter((event) => !excludeIds.has(event.id))
        : allEvents;
    const result = buildCooldownsStrict(filteredEvents);
    if (!result.ok) {
      return false;
    }
    resolvedCooldownEvents = result.cooldownEvents;
  }

  const ownerKey = buildOwnerKey(ownerId, ownerJob);

  for (const cooldown of resolvedCooldownEvents) {
    if (cooldown.skillId !== baseSkillId) continue;
    const matchesOwner =
      !ownerKey || !cooldown.ownerKey || (ownerKey && cooldown.ownerKey === ownerKey);
    if (!matchesOwner) continue;
    if (startMs >= cooldown.tStartMs && startMs < cooldown.tEndMs) {
      return false;
    }
  }

  return true;
}

function buildPlayerCastStateInternal(events: MitEvent[], mode: BuildMode): PlayerCastState {
  const stackEvents = buildStackEvents(events, mode);
  const { boundaries, resourceEvents } = buildBoundaries(stackEvents, mode);
  const cooldownEvents = buildCooldownEvents(boundaries, mode);
  cooldownEvents.sort((a, b) => a.tStartMs - b.tStartMs);
  resourceEvents.sort(
    (a, b) =>
      a.tStartMs - b.tStartMs ||
      a.resourceGroupId.localeCompare(b.resourceGroupId) ||
      (a.ownerKey ?? '').localeCompare(b.ownerKey ?? ''),
  );
  return { cooldownEvents, resourceEvents };
}
