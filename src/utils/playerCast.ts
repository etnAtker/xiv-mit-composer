import { MS_PER_SEC } from '../constants/time';
import { COOLDOWN_GROUP_MAP, COOLDOWN_GROUP_SKILLS_MAP, SKILL_MAP } from '../data/skills';
import type { CooldownEvent, MitEvent } from '../model/types';

const GROUP_PREFIX = 'grp:';

export function tryBuildCooldowns(events: MitEvent[]): CooldownEvent[] | void {
  const stackEvents = buildStackEvents(events);
  stackEvents.sort((a, b) => a.tMs - b.tMs);

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
    const skillMeta = SKILL_MAP.get(event.skillId);

    if (!skillMeta) {
      console.error(`致命错误：未找到技能 ${event.skillId} 的定义。`);
      continue;
    }

    const ownerKey = event.ownerJob ?? (event.ownerId ? String(event.ownerId) : undefined);
    const skillResourceKey = ownerKey ? `${event.skillId}:${ownerKey}` : event.skillId;
    const skillCooldownMs = skillMeta.cooldownSec * MS_PER_SEC;
    pushStackEvents(stackEvents, {
      resourceKey: skillResourceKey,
      ownerKey,
      skillId: event.skillId,
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
        skillId: event.skillId,
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

    if (stack < 0) return;

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
  const skill = SKILL_MAP.get(skillId);
  if (!skill) {
    console.error(`致命错误：技能 ${skillId} 不存在`);
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

function toGroupResourceId(groupId: string): string {
  return `${GROUP_PREFIX}${groupId}`;
}

function stripGroupPrefix(resourceId: string): string {
  const raw = resourceId.startsWith(GROUP_PREFIX)
    ? resourceId.slice(GROUP_PREFIX.length)
    : resourceId;
  return raw.split(':')[0];
}
