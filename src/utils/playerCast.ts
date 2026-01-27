import { MS_PER_SEC } from '../constants/time';
import {
  COOLDOWN_GROUP_MAP,
  COOLDOWN_GROUP_SKILLS_MAP,
  getSkillDefinition,
  normalizeSkillId,
} from '../data/skills';
import type { CooldownEvent, Job, MitEvent } from '../model/types';

const GROUP_PREFIX = 'grp:';
const buildOwnerKey = (ownerId?: number, ownerJob?: Job) => {
  if (typeof ownerId === 'number') return `id:${ownerId}`;
  if (ownerJob) return `job:${ownerJob}`;
  return undefined;
};

export function tryBuildCooldowns(events: MitEvent[]): CooldownEvent[] | void {
  const stackEvents = buildStackEvents(events);
  const typeOrder: Record<StackEvent['type'], number> = { recover: 0, consume: 1 };
  stackEvents.sort((a, b) => a.tMs - b.tMs || typeOrder[a.type] - typeOrder[b.type]);

  const skillStacksCounts = buildBoundaries(stackEvents);
  if (!skillStacksCounts) return;

  const newEvents = buildCooldownEvents(skillStacksCounts);
  newEvents.sort((a, b) => a.tStartMs - b.tStartMs);
  return newEvents;
}

interface StackEvent {
  resourceKey: string;
  ownerKey?: string;
  skillId: string;
  isGroup: boolean;
  type: 'consume' | 'recover';
  cooldownMs: number;
  tMs: number;
}

function buildStackEvents(mitEvents: MitEvent[]): StackEvent[] {
  const stackEvents: StackEvent[] = [];

  for (const event of mitEvents) {
    const baseSkillId = normalizeSkillId(event.skillId);
    const skillMeta = getSkillDefinition(baseSkillId);

    if (!skillMeta) {
      console.error(`致命错误：未找到技能 ${baseSkillId} 的定义。`);
      continue;
    }

    const ownerKey = buildOwnerKey(event.ownerId, event.ownerJob);
    const skillResourceKey = ownerKey ? `${baseSkillId}:${ownerKey}` : baseSkillId;
    const skillCooldownMs = skillMeta.cooldownSec * MS_PER_SEC;
    pushStackEvents(stackEvents, {
      resourceKey: skillResourceKey,
      ownerKey,
      skillId: baseSkillId,
      isGroup: false,
      tStartMs: event.tStartMs,
      cooldownMs: skillCooldownMs,
    });

    const skillGroupId = skillMeta.cooldownGroup;
    if (skillGroupId) {
      const cooldownGroupMeta = COOLDOWN_GROUP_MAP.get(skillGroupId);
      if (!cooldownGroupMeta) {
        console.error(`致命错误：未找到技能组 ${skillGroupId} 的定义。`);
        continue;
      }

      const groupCooldownMs = cooldownGroupMeta.cooldownSec * MS_PER_SEC;
      const groupResourceBase = toGroupResourceId(skillGroupId);
      const groupResourceKey = ownerKey ? `${groupResourceBase}:${ownerKey}` : groupResourceBase;
      pushStackEvents(stackEvents, {
        resourceKey: groupResourceKey,
        ownerKey,
        skillId: baseSkillId,
        isGroup: true,
        tStartMs: event.tStartMs,
        cooldownMs: groupCooldownMs,
      });
    }
  }

  return stackEvents;
}

function pushStackEvents(
  stackEvents: StackEvent[],
  payload: {
    resourceKey: string;
    ownerKey?: string;
    skillId: string;
    isGroup: boolean;
    tStartMs: number;
    cooldownMs: number;
  },
): void {
  stackEvents.push(
    {
      resourceKey: payload.resourceKey,
      ownerKey: payload.ownerKey,
      skillId: payload.skillId,
      isGroup: payload.isGroup,
      type: 'consume',
      cooldownMs: payload.cooldownMs,
      tMs: payload.tStartMs,
    },
    {
      resourceKey: payload.resourceKey,
      ownerKey: payload.ownerKey,
      skillId: payload.skillId,
      isGroup: payload.isGroup,
      type: 'recover',
      cooldownMs: payload.cooldownMs,
      tMs: payload.tStartMs + payload.cooldownMs,
    },
  );
}

interface CooldownEventBoundary {
  skillId: string;
  resourceId: string;
  tMs: number;
  boundaryType: 'unusedStart' | 'unusedEnd' | 'cooldownStart' | 'cooldownEnd';
}

function buildBoundaries(stackEvents: StackEvent[]): Map<string, CooldownEventBoundary[]> | void {
  const stacksBuffer = new Map<string, number>();
  const boundaries = new Map<string, CooldownEventBoundary[]>();
  const getSkillKey = (skillId: string, ownerKey?: string) =>
    ownerKey ? `${skillId}:${ownerKey}` : skillId;

  for (const stackEvent of stackEvents) {
    const initialStack = getInitialStack(stackEvent);
    let stack = stacksBuffer.get(stackEvent.resourceKey) ?? initialStack;

    const stackDelta = stackEvent.type === 'consume' ? -1 : 1;
    stack += stackDelta;

    if (stack < 0) {
      console.error(`错误：${stackEvent.resourceKey} 冷却层数为负，已重置为 0。`);
      stack = 0;
    }

    const buildBoundary = (skillId: string): CooldownEventBoundary[] => {
      if (stack === 0) {
        return [
          {
            skillId,
            resourceId: stackEvent.resourceKey,
            tMs: stackEvent.tMs - stackEvent.cooldownMs,
            boundaryType: 'unusedStart',
          },
          {
            skillId,
            resourceId: stackEvent.resourceKey,
            tMs: stackEvent.tMs,
            boundaryType: 'unusedEnd',
          },
          {
            skillId,
            resourceId: stackEvent.resourceKey,
            tMs: stackEvent.tMs,
            boundaryType: 'cooldownStart',
          },
        ];
      }

      if (stack === 1 && stackDelta === 1) {
        return [
          {
            skillId,
            resourceId: stackEvent.resourceKey,
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

function buildCooldownEvents(boundaries: Map<string, CooldownEventBoundary[]>): CooldownEvent[] {
  const cooldowns: CooldownEvent[] = [];

  for (const bs of boundaries.values()) {
    if (!bs.length) continue;
    const skillId = bs[0].skillId;
    cooldowns.push(...buildCooldownEventsSingle(skillId, bs));
  }

  return cooldowns;
}

function buildCooldownEventsSingle(
  skillId: string,
  boundaries: CooldownEventBoundary[],
): CooldownEvent[] {
  const skill = getSkillDefinition(skillId);
  if (!skill) {
    console.error(`致命错误：技能 ${normalizeSkillId(skillId)} 不存在`);
    return [];
  }

  const cooldowns: CooldownEvent[] = [];

  boundaries.sort((a, b) => a.tMs - b.tMs);

  let lastCooldown: CooldownEvent | undefined;
  let unusableOpenCount = 0;
  let cooldownOpenCount = 0;

  const closeLastCooldown = (tMs: number) => {
    if (lastCooldown === undefined) {
      console.error(`错误：没有找到未闭合的cooldown`);
      return;
    }
    lastCooldown.tEndMs = tMs;
    lastCooldown.durationMs = lastCooldown.tEndMs - lastCooldown.tStartMs;
    cooldowns.push(lastCooldown);
    lastCooldown = undefined;
  };

  const startNewCooldown = (type: CooldownEvent['cdType'], tMs: number) => {
    if (lastCooldown) {
      console.error(`错误：有未闭合的cooldown`);
      return;
    }
    lastCooldown = {
      eventType: 'cooldown',
      cdType: type,
      skillId,
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
        }

        if (unusableOpenCount !== 0) {
          startNewCooldown('unusable', boundary.tMs);
        }
        break;
    }
  }

  return cooldowns;
}

const matchesOwner = (event: MitEvent, ownerId?: number, ownerJob?: Job) => {
  if (typeof ownerId === 'number') {
    return event.ownerId === ownerId;
  }
  if (ownerJob) {
    return event.ownerJob === ownerJob;
  }
  return true;
};

export function canUseSkillAt(payload: {
  skillId: string;
  tStartMs: number;
  events: MitEvent[];
  excludeIds?: Set<string>;
  ownerId?: number;
  ownerJob?: Job;
}): boolean {
  const { skillId, tStartMs, events, excludeIds, ownerId, ownerJob } = payload;
  const baseSkillId = normalizeSkillId(skillId);
  const skillMeta = getSkillDefinition(baseSkillId);
  if (!skillMeta) {
    console.error(`错误：未找到技能 ${baseSkillId} 的定义。`);
    return false;
  }

  const cooldownMs = skillMeta.cooldownSec * MS_PER_SEC;
  if (cooldownMs > 0) {
    for (const event of events) {
      if (excludeIds?.has(event.id)) continue;
      if (normalizeSkillId(event.skillId) !== baseSkillId) continue;
      if (!matchesOwner(event, ownerId, ownerJob)) continue;
      const eventStart = event.tStartMs;
      if (tStartMs >= eventStart && tStartMs < eventStart + cooldownMs) {
        return false;
      }
      if (eventStart >= tStartMs && eventStart < tStartMs + cooldownMs) {
        return false;
      }
    }
  }

  const groupId = skillMeta.cooldownGroup;
  if (!groupId) return true;

  const groupMeta = COOLDOWN_GROUP_MAP.get(groupId);
  if (!groupMeta) {
    console.error(`错误：未找到技能组 ${groupId} 的定义。`);
    return true;
  }

  const groupSkills = COOLDOWN_GROUP_SKILLS_MAP.get(groupId) ?? [];
  const groupSkillIds = new Set(
    groupSkills.length ? groupSkills.map((skill) => skill.id) : [baseSkillId],
  );
  const groupCooldownMs = groupMeta.cooldownSec * MS_PER_SEC;
  const maxCharges = groupMeta.stack ?? 1;

  const checkpoints: { tMs: number; delta: number; order: number }[] = [];

  for (const event of events) {
    if (excludeIds?.has(event.id)) continue;
    if (!groupSkillIds.has(normalizeSkillId(event.skillId))) continue;
    if (!matchesOwner(event, ownerId, ownerJob)) continue;

    const consumeAt = event.tStartMs;
    const recoverAt = event.tStartMs + groupCooldownMs;
    checkpoints.push({ tMs: recoverAt, delta: 1, order: 0 });
    checkpoints.push({ tMs: consumeAt, delta: -1, order: 1 });
  }

  const candidateRecoverAt = tStartMs + groupCooldownMs;
  checkpoints.push({ tMs: candidateRecoverAt, delta: 1, order: 0 });
  checkpoints.push({ tMs: tStartMs, delta: -1, order: 1 });

  checkpoints.sort((a, b) => a.tMs - b.tMs || a.order - b.order);

  let charges = maxCharges;
  for (const point of checkpoints) {
    charges = Math.min(maxCharges, charges + point.delta);
    if (charges < 0) {
      return false;
    }
  }

  return true;
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
