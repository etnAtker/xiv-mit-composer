import { MS_PER_SEC } from '../constants/time';
import {
  COOLDOWN_GROUP_MAP,
  COOLDOWN_GROUP_SKILLS_MAP,
  getSkillDefinition,
  normalizeSkillId,
} from '../data/skills';
import type { CooldownEvent, Job, MitEvent } from '../model/types';
import { BinaryHeap } from './BinaryHeap';

const GROUP_PREFIX = 'grp:';

type BuildMode = 'strict' | 'tolerant';

export interface CooldownBuildFailure {
  ok: false;
  code:
    | 'UNKNOWN_SKILL'
    | 'UNKNOWN_GROUP'
    | 'NEGATIVE_STACK'
    | 'MISSING_OPEN_COOLDOWN'
    | 'DUPLICATE_OPEN_COOLDOWN'
    | 'UNCLOSED_COOLDOWN';
  message: string;
}

export interface CooldownBuildSuccess {
  ok: true;
  cooldownEvents: CooldownEvent[];
}

export type CooldownBuildResult = CooldownBuildSuccess | CooldownBuildFailure;

export type MitigationStateFailure = CooldownBuildFailure;

export interface MitigationStateSuccess {
  ok: true;
  mitEvents: MitEvent[];
  cooldownEvents: CooldownEvent[];
}

export type MitigationStateResult = MitigationStateSuccess | MitigationStateFailure;

class CooldownBuildError extends Error {
  code: CooldownBuildFailure['code'];

  constructor(code: CooldownBuildFailure['code'], message: string) {
    super(message);
    this.name = 'CooldownBuildError';
    this.code = code;
  }
}

const buildOwnerKey = (ownerId?: number, ownerJob?: Job) => {
  if (typeof ownerId === 'number') return `id:${ownerId}`;
  if (ownerJob) return `job:${ownerJob}`;
  return undefined;
};

function sortMitEvents(events: MitEvent[]) {
  return [...events].sort((a, b) => a.tStartMs - b.tStartMs);
}

export function buildCooldownsStrict(events: MitEvent[]): CooldownBuildResult {
  try {
    return { ok: true, cooldownEvents: buildCooldownEventsInternal(events, 'strict') };
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
  return buildCooldownEventsInternal(events, 'tolerant');
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

interface StackEvent {
  resourceKey: string;
  ownerKey?: string;
  ownerJob?: Job;
  skillId: string;
  isGroup: boolean;
  type: 'consume' | 'recover';
  cooldownMs: number;
  tMs: number;
}

interface CooldownEventBoundary {
  skillId: string;
  resourceId: string;
  ownerKey?: string;
  ownerJob?: Job;
  tMs: number;
  boundaryType: 'unusedStart' | 'unusedEnd' | 'cooldownStart' | 'cooldownEnd';
}

const stackEventOrder: Record<StackEvent['type'], number> = { recover: 0, consume: 1 };

function buildCooldownEventsInternal(events: MitEvent[], mode: BuildMode): CooldownEvent[] {
  const stackEvents = buildStackEvents(events, mode);
  const boundaries = buildBoundaries(stackEvents, mode);
  const cooldownEvents = buildCooldownEvents(boundaries, mode);
  cooldownEvents.sort((a, b) => a.tStartMs - b.tStartMs);
  return cooldownEvents;
}

function buildStackEvents(mitEvents: MitEvent[], mode: BuildMode): BinaryHeap<StackEvent> {
  const stackEvents: BinaryHeap<StackEvent> = new BinaryHeap<StackEvent>(
    (a, b) => a.tMs - b.tMs || stackEventOrder[a.type] - stackEventOrder[b.type],
  );

  for (const event of mitEvents) {
    const baseSkillId = normalizeSkillId(event.skillId);
    const skillMeta = getSkillDefinition(baseSkillId);

    if (!skillMeta) {
      handleBuildFailure(mode, 'UNKNOWN_SKILL', `致命错误：未找到技能 ${baseSkillId} 的定义。`);
      continue;
    }

    const ownerKey = buildOwnerKey(event.ownerId, event.ownerJob);
    const skillResourceKey = ownerKey ? `${baseSkillId}:${ownerKey}` : baseSkillId;
    const skillCooldownMs = skillMeta.cooldownSec * MS_PER_SEC;
    stackEvents.push({
      resourceKey: skillResourceKey,
      ownerKey,
      ownerJob: event.ownerJob,
      skillId: baseSkillId,
      isGroup: false,
      type: 'consume',
      cooldownMs: skillCooldownMs,
      tMs: event.tStartMs,
    });

    const skillGroupId = skillMeta.cooldownGroup;
    if (!skillGroupId) continue;

    const cooldownGroupMeta = COOLDOWN_GROUP_MAP.get(skillGroupId);
    if (!cooldownGroupMeta) {
      handleBuildFailure(mode, 'UNKNOWN_GROUP', `致命错误：未找到技能组 ${skillGroupId} 的定义。`);
      continue;
    }

    const groupCooldownMs = cooldownGroupMeta.cooldownSec * MS_PER_SEC;
    const groupResourceBase = toGroupResourceId(skillGroupId);
    const groupResourceKey = ownerKey ? `${groupResourceBase}:${ownerKey}` : groupResourceBase;
    stackEvents.push({
      resourceKey: groupResourceKey,
      ownerKey,
      ownerJob: event.ownerJob,
      skillId: baseSkillId,
      isGroup: true,
      type: 'consume',
      cooldownMs: groupCooldownMs,
      tMs: event.tStartMs,
    });
  }

  return stackEvents;
}

function buildBoundaries(
  stackEvents: BinaryHeap<StackEvent>,
  mode: BuildMode,
): Map<string, CooldownEventBoundary[]> {
  const stacksBuffer = new Map<string, number>();
  const boundaries = new Map<string, CooldownEventBoundary[]>();
  const getSkillKey = (skillId: string, ownerKey?: string) =>
    ownerKey ? `${skillId}:${ownerKey}` : skillId;

  for (let stackEvent = stackEvents.pop(); stackEvent; stackEvent = stackEvents.pop()) {
    const initialStack = getInitialStack(stackEvent);
    let stack = stacksBuffer.get(stackEvent.resourceKey) ?? initialStack;

    if (stackEvent.type === 'consume') {
      if (stack === initialStack) {
        stackEvents.push({
          ...stackEvent,
          type: 'recover',
          tMs: stackEvent.tMs + stackEvent.cooldownMs,
        });
      }
      stack -= 1;
    } else {
      stack += 1;
      if (stack !== initialStack) {
        stackEvents.push({
          ...stackEvent,
          type: 'recover',
          tMs: stackEvent.tMs + stackEvent.cooldownMs,
        });
      }
    }

    if (stack < 0) {
      handleBuildFailure(
        mode,
        'NEGATIVE_STACK',
        `错误：${stackEvent.resourceKey} 冷却层数为负，无法构建合法的冷却状态。`,
      );
      stack = 0;
    }

    const buildBoundary = (skillId: string): CooldownEventBoundary[] => {
      if (stack === 0) {
        return [
          {
            skillId,
            resourceId: stackEvent.resourceKey,
            ownerKey: stackEvent.ownerKey,
            ownerJob: stackEvent.ownerJob,
            tMs: stackEvent.tMs - stackEvent.cooldownMs,
            boundaryType: 'unusedStart',
          },
          {
            skillId,
            resourceId: stackEvent.resourceKey,
            ownerKey: stackEvent.ownerKey,
            ownerJob: stackEvent.ownerJob,
            tMs: stackEvent.tMs,
            boundaryType: 'unusedEnd',
          },
          {
            skillId,
            resourceId: stackEvent.resourceKey,
            ownerKey: stackEvent.ownerKey,
            ownerJob: stackEvent.ownerJob,
            tMs: stackEvent.tMs,
            boundaryType: 'cooldownStart',
          },
        ];
      }

      if (stack === 1 && stackEvent.type === 'recover') {
        return [
          {
            skillId,
            resourceId: stackEvent.resourceKey,
            ownerKey: stackEvent.ownerKey,
            ownerJob: stackEvent.ownerJob,
            tMs: stackEvent.tMs,
            boundaryType: 'cooldownEnd',
          },
        ];
      }

      return [];
    };

    if (!stackEvent.isGroup) {
      const skillKey = getSkillKey(stackEvent.skillId, stackEvent.ownerKey);
      const boundary = boundaries.get(skillKey) || [];
      boundary.push(...buildBoundary(stackEvent.skillId));
      boundaries.set(skillKey, boundary);
    } else {
      const skills = COOLDOWN_GROUP_SKILLS_MAP.get(stripGroupPrefix(stackEvent.resourceKey));
      if (!skills) continue;

      for (const skill of skills) {
        const skillKey = getSkillKey(skill.id, stackEvent.ownerKey);
        const boundary = boundaries.get(skillKey) ?? [];
        boundary.push(...buildBoundary(skill.id));
        boundaries.set(skillKey, boundary);
      }
    }

    stacksBuffer.set(stackEvent.resourceKey, stack);
  }

  return boundaries;
}

function getInitialStack(stackEvent: StackEvent): number {
  if (!stackEvent.isGroup) return 1;

  const cooldownGroupMeta = COOLDOWN_GROUP_MAP.get(stripGroupPrefix(stackEvent.resourceKey));
  return cooldownGroupMeta?.stack ?? 1;
}

function buildCooldownEvents(
  boundaries: Map<string, CooldownEventBoundary[]>,
  mode: BuildMode,
): CooldownEvent[] {
  const cooldowns: CooldownEvent[] = [];

  for (const bs of boundaries.values()) {
    if (!bs.length) continue;
    const skillId = bs[0].skillId;
    cooldowns.push(...buildCooldownEventsSingle(skillId, bs, mode));
  }

  return cooldowns;
}

function buildCooldownEventsSingle(
  skillId: string,
  boundaries: CooldownEventBoundary[],
  mode: BuildMode,
): CooldownEvent[] {
  const skill = getSkillDefinition(skillId);
  if (!skill) {
    handleBuildFailure(mode, 'UNKNOWN_SKILL', `致命错误：技能 ${normalizeSkillId(skillId)} 不存在`);
    return [];
  }

  const cooldowns: CooldownEvent[] = [];
  const ownerKey = boundaries[0]?.ownerKey;
  const ownerJob = boundaries[0]?.ownerJob;

  boundaries.sort((a, b) => a.tMs - b.tMs);

  let lastCooldown: CooldownEvent | undefined;
  let unusableOpenCount = 0;
  let cooldownOpenCount = 0;

  const closeLastCooldown = (tMs: number) => {
    if (lastCooldown === undefined) {
      handleBuildFailure(mode, 'MISSING_OPEN_COOLDOWN', '错误：没有找到未闭合的cooldown。');
      return;
    }
    lastCooldown.tEndMs = tMs;
    lastCooldown.durationMs = lastCooldown.tEndMs - lastCooldown.tStartMs;
    cooldowns.push(lastCooldown);
    lastCooldown = undefined;
  };

  const startNewCooldown = (type: CooldownEvent['cdType'], tMs: number) => {
    if (lastCooldown) {
      handleBuildFailure(mode, 'DUPLICATE_OPEN_COOLDOWN', '错误：有未闭合的cooldown。');
      return;
    }
    lastCooldown = {
      eventType: 'cooldown',
      cdType: type,
      skillId,
      ownerJob,
      ownerKey,
      tStartMs: tMs,
      durationMs: 0,
      tEndMs: 0,
    };
  };

  for (const boundary of boundaries) {
    switch (boundary.boundaryType) {
      case 'unusedStart':
        if (unusableOpenCount === 0 && cooldownOpenCount === 0) {
          startNewCooldown('unusable', boundary.tMs);
        }
        unusableOpenCount++;
        break;
      case 'unusedEnd':
        unusableOpenCount--;
        if (unusableOpenCount === 0 && cooldownOpenCount === 0) {
          closeLastCooldown(boundary.tMs);
        }
        break;
      case 'cooldownStart':
        if (cooldownOpenCount === 0 && unusableOpenCount !== 0) {
          closeLastCooldown(boundary.tMs);
        }

        if (cooldownOpenCount === 0) {
          startNewCooldown('cooldown', boundary.tMs);
        }
        cooldownOpenCount++;
        break;
      case 'cooldownEnd':
        cooldownOpenCount--;
        if (cooldownOpenCount === 0) {
          closeLastCooldown(boundary.tMs);

          if (unusableOpenCount !== 0) {
            startNewCooldown('unusable', boundary.tMs);
          }
        }
        break;
    }
  }

  if (lastCooldown || unusableOpenCount !== 0 || cooldownOpenCount !== 0) {
    handleBuildFailure(mode, 'UNCLOSED_COOLDOWN', `错误：技能 ${skillId} 存在未闭合的冷却区间。`);
  }

  return cooldowns;
}

function handleBuildFailure(
  mode: BuildMode,
  code: CooldownBuildFailure['code'],
  message: string,
): never | void {
  if (mode === 'strict') {
    throw new CooldownBuildError(code, message);
  }
  console.error(message);
}

function toGroupResourceId(groupId: string): string {
  return `${GROUP_PREFIX}${groupId}`;
}

function stripGroupPrefix(resourceId: string): string {
  const raw = resourceId.startsWith(GROUP_PREFIX)
    ? resourceId.slice(GROUP_PREFIX.length)
    : resourceId;
  return raw.split(':')[0];
}
