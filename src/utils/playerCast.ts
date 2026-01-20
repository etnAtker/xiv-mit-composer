import { MS_PER_SEC } from '../constants/time';
import { COOLDOWN_GROUP_MAP, COOLDOWN_GROUP_SKILLS_MAP, SKILL_MAP } from '../data/skills';
import type { CooldownEvent, MitEvent, PlayerEvent } from '../model/types';

export function adjustEvents(
  eventsToAdjust: MitEvent[],
  events: PlayerEvent[],
): PlayerEvent[] | void {
  const allEvents = [...eventsToAdjust, ...events];
  return sanitizeEvents(allEvents);
}

interface StackEvent {
  resourceId: string;
  isGroup: boolean;
  type: 'consume' | 'recover';
  tMs: number;
}

interface StackCountChange {
  skillId: string;
  resourceId: string;
  isGroup: boolean;
  tMs: number;
  stacks: number;
}

const GROUP_PREFIX = 'grp:';

// 约定：
// - actual 表示真实可用层数（consume/recover 影响）
// - estimate 表示考虑未来占用后的可用层数（reserve/release 影响）
// - reserve/release 用于表达“未来要用 -> 当前不可用（unusable）”
function sanitizeEvents(events: PlayerEvent[]): PlayerEvent[] | void {
  const mitEvents = getSortedMitEvents(events);
  const stackEvents = buildStackEvents(mitEvents);
  stackEvents.sort((a, b) => a.tMs - b.tMs);

  const skillStacksCounts = buildStackChanges(stackEvents);
  if (!skillStacksCounts) return;

  const newEvents = buildCooldownEvents(skillStacksCounts);
  newEvents.sort((a, b) => a.tStartMs - b.tStartMs);
  return newEvents;
}

function getSortedMitEvents(events: PlayerEvent[]): MitEvent[] {
  return events
    .filter((e): e is MitEvent => e.eventType === 'mit')
    .sort((a, b) => a.tStartMs - b.tStartMs);
}

function buildStackEvents(mitEvents: MitEvent[]): StackEvent[] {
  const stackEvents: StackEvent[] = [];

  for (const event of mitEvents) {
    const skillMeta = SKILL_MAP.get(event.skillId);

    if (!skillMeta) {
      console.error(`致命错误：未找到技能 ${event.skillId} 的定义。`);
      continue;
    }

    const skillCooldownMs = skillMeta.cooldownSec * MS_PER_SEC;
    pushStackEvents(stackEvents, {
      resourceId: event.skillId,
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
      pushStackEvents(stackEvents, {
        resourceId: toGroupResourceId(skillGroupId),
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
  payload: { resourceId: string; isGroup: boolean; tStartMs: number; cooldownMs: number },
): void {
  stackEvents.push(
    {
      resourceId: payload.resourceId,
      isGroup: payload.isGroup,
      type: 'consume',
      tMs: payload.tStartMs,
    },
    {
      resourceId: payload.resourceId,
      isGroup: payload.isGroup,
      type: 'recover',
      tMs: payload.tStartMs + payload.cooldownMs,
    },
  );
}

function buildStackChanges(stackEvents: StackEvent[]): Map<string, StackCountChange[]> | void {
  const stacksBuffer = new Map<string, number>();
  const skillStacksCounts = new Map<string, StackCountChange[]>();

  for (const stackEvent of stackEvents) {
    const initialStack = getInitialStack(stackEvent);
    let stack = stacksBuffer.get(stackEvent.resourceId) ?? initialStack;

    stack += stackEvent.type === 'consume' ? -1 : 1;
    if (stack < 0) {
      return;
    }

    if (!stackEvent.isGroup) {
      const count = skillStacksCounts.get(stackEvent.resourceId) || [];
      count.push({
        skillId: stackEvent.resourceId,
        resourceId: stackEvent.resourceId,
        isGroup: false,
        tMs: stackEvent.tMs,
        stacks: stack,
      });
      skillStacksCounts.set(stackEvent.resourceId, count);
    } else {
      const skills = COOLDOWN_GROUP_SKILLS_MAP.get(stripGroupPrefix(stackEvent.resourceId));
      if (!skills) continue;

      for (const skill of skills) {
        const count = skillStacksCounts.get(skill.id) ?? [];
        count.push({
          skillId: skill.id,
          resourceId: stackEvent.resourceId,
          isGroup: true,
          tMs: stackEvent.tMs,
          stacks: stack,
        });
        skillStacksCounts.set(skill.id, count);
      }
    }

    stacksBuffer.set(stackEvent.resourceId, stack);
  }

  return skillStacksCounts;
}

function getInitialStack(stackEvent: StackEvent): number {
  if (!stackEvent.isGroup) return 1;

  const cooldownGroupMeta = COOLDOWN_GROUP_MAP.get(stripGroupPrefix(stackEvent.resourceId));
  return cooldownGroupMeta?.stack ?? 1;
}

function buildCooldownEvents(skillStacksCounts: Map<string, StackCountChange[]>): PlayerEvent[] {
  const newEvents: PlayerEvent[] = [];

  for (const [skillId, counts] of skillStacksCounts) {
    newEvents.push(...buildCooldownEventsForSkill(skillId, counts));
  }

  return newEvents;
}

type LastCooldown = {
  self: CooldownEvent | undefined;
  group: CooldownEvent | undefined;
};

function buildCooldownEventsForSkill(skillId: string, counts: StackCountChange[]): CooldownEvent[] {
  const skill = SKILL_MAP.get(skillId);
  if (!skill) {
    console.error(`致命错误：技能 ${skillId} 不存在`);
    return [];
  }

  const cooldownGroup = COOLDOWN_GROUP_MAP.get(skill?.cooldownGroup || '');
  const events: CooldownEvent[] = [];

  counts.sort((a, b) => a.tMs - b.tMs);

  const stacks = {
    self: 1,
    group: cooldownGroup?.stack ?? 1,
  };

  const lastCooldowns: LastCooldown = {
    self: undefined,
    group: undefined,
  };

  const lastUnusables: LastCooldown = {
    self: undefined,
    group: undefined,
  };

  const closeLastCooldown = (isGroup: boolean, tMs: number) => {
    const lastCooldown = isGroup ? lastCooldowns.group : lastCooldowns.self;
    if (lastCooldown === undefined) {
      console.error(`致命错误：没有找到未闭合的cooldown`);
      return;
    }
    lastCooldown.tEndMs = tMs;
    lastCooldown.durationMs = lastCooldown.tEndMs - lastCooldown.tStartMs;
    events.push(lastCooldown);
    lastCooldowns[isGroup ? 'group' : 'self'] = undefined;
  };

  const startNewCooldown = (isGroup: boolean, tMs: number) => {
    lastCooldowns[isGroup ? 'group' : 'self'] = {
      eventType: 'cooldown',
      cdType: 'cooldown',
      skillId,
      skillGroupId: skill?.cooldownGroup,
      tStartMs: tMs,
      durationMs: 0,
      tEndMs: 0,
    };
  };

  const updateUnusable = (isGroup: boolean, tStartMs: number, tEndMs: number) => {
    let lastUnusable = isGroup ? lastUnusables.group : lastUnusables.self;

    lastUnusable ??= {
      eventType: 'cooldown',
      cdType: 'unusable',
      skillId,
      skillGroupId: skill?.cooldownGroup,
      tStartMs,
      durationMs: tEndMs - tStartMs,
      tEndMs,
    };

    if (lastUnusable.tEndMs >= tStartMs) {
      lastUnusable.tEndMs = tEndMs;
      lastUnusable.durationMs = lastUnusable.tEndMs - lastUnusable.tStartMs;
    } else {
      events.push(lastUnusable);
      lastUnusable = {
        eventType: 'cooldown',
        cdType: 'unusable',
        skillId,
        skillGroupId: skill?.cooldownGroup,
        tStartMs,
        durationMs: tEndMs - tStartMs,
        tEndMs,
      };
    }

    lastUnusables[isGroup ? 'group' : 'self'] = lastUnusable;
  };

  for (const countMeta of counts) {
    const currStacks = stacks[countMeta.isGroup ? 'group' : 'self'];
    const newStacks = countMeta.stacks;

    if ((currStacks > 0 && newStacks > 0) || (currStacks === 0 && newStacks === 0)) continue;

    // 下降沿
    if (currStacks > 0 && newStacks === 0) {
      startNewCooldown(countMeta.isGroup, countMeta.tMs);

      const meta = countMeta.isGroup && cooldownGroup ? cooldownGroup : skill;
      const tStartMs = countMeta.tMs - meta.cooldownSec * MS_PER_SEC;
      updateUnusable(countMeta.isGroup, tStartMs, countMeta.tMs);
    }

    // 上升沿
    if (currStacks === 0 && newStacks > 0) {
      closeLastCooldown(countMeta.isGroup, countMeta.tMs);
    }

    stacks[countMeta.isGroup ? 'group' : 'self'] = newStacks;
  }

  if (lastUnusables.self) events.push(lastUnusables.self);
  if (lastUnusables.group) events.push(lastUnusables.group);
  if (lastCooldowns.self) events.push(lastCooldowns.self);
  if (lastCooldowns.group) events.push(lastCooldowns.group);

  processCooldownsCover(events);
  return events;
}

function processCooldownsCover(events: PlayerEvent[]) {
  const cooldownEventsAll = mergeCooldownEventsByType(events.filter(isCooldownEvent));
  const cooldownEvents = cooldownEventsAll.filter((e) => e.cdType === 'cooldown');
  const unusableEvents = cooldownEventsAll.filter((e) => e.cdType === 'unusable');
  const otherEvents = events.filter((e) => !isCooldownEvent(e));

  if (!cooldownEvents.length || !unusableEvents.length) {
    events.length = 0;
    events.push(...otherEvents, ...cooldownEventsAll);
    events.sort((a, b) => a.tStartMs - b.tStartMs);
    return;
  }

  cooldownEvents.sort((a, b) => a.tStartMs - b.tStartMs);
  const mergedCovers: { start: number; end: number }[] = [];

  for (const cd of cooldownEvents) {
    const start = cd.tStartMs;
    const end = cd.tEndMs;
    if (mergedCovers.length === 0) {
      mergedCovers.push({ start, end });
      continue;
    }

    const last = mergedCovers[mergedCovers.length - 1];
    if (start <= last.end) {
      last.end = Math.max(last.end, end);
    } else {
      mergedCovers.push({ start, end });
    }
  }

  const processedUnusable: CooldownEvent[] = [];

  for (const unusable of unusableEvents) {
    let segments = [{ start: unusable.tStartMs, end: unusable.tEndMs }];

    for (const cover of mergedCovers) {
      if (segments.length === 0) break;
      const nextSegments: { start: number; end: number }[] = [];

      for (const seg of segments) {
        if (cover.end <= seg.start || cover.start >= seg.end) {
          nextSegments.push(seg);
          continue;
        }

        if (cover.start <= seg.start && cover.end >= seg.end) {
          continue;
        }

        if (cover.start <= seg.start && cover.end < seg.end) {
          nextSegments.push({ start: cover.end, end: seg.end });
          continue;
        }

        if (cover.start > seg.start && cover.end >= seg.end) {
          nextSegments.push({ start: seg.start, end: cover.start });
          continue;
        }

        nextSegments.push({ start: seg.start, end: cover.start });
        nextSegments.push({ start: cover.end, end: seg.end });
      }

      segments = nextSegments;
    }

    for (const seg of segments) {
      if (seg.end <= seg.start) continue;
      processedUnusable.push({
        ...unusable,
        tStartMs: seg.start,
        tEndMs: seg.end,
        durationMs: seg.end - seg.start,
      });
    }
  }

  const mergedUnusable = mergeCooldownEventsByType(processedUnusable);
  events.length = 0;
  events.push(...otherEvents, ...cooldownEvents, ...mergedUnusable);
  events.sort((a, b) => a.tStartMs - b.tStartMs);
}

function isCooldownEvent(event: PlayerEvent): event is CooldownEvent {
  return event.eventType === 'cooldown';
}

function mergeCooldownEventsByType(events: CooldownEvent[]): CooldownEvent[] {
  const byType = new Map<CooldownEvent['cdType'], CooldownEvent[]>();

  for (const event of events) {
    const list = byType.get(event.cdType) ?? [];
    list.push({ ...event });
    byType.set(event.cdType, list);
  }

  const merged: CooldownEvent[] = [];

  for (const [, list] of byType) {
    list.sort((a, b) => a.tStartMs - b.tStartMs);

    for (const current of list) {
      const last = merged[merged.length - 1];
      if (!last || last.cdType !== current.cdType || current.tStartMs > last.tEndMs) {
        merged.push({ ...current });
        continue;
      }

      if (current.tEndMs > last.tEndMs) {
        last.tEndMs = current.tEndMs;
        last.durationMs = last.tEndMs - last.tStartMs;
      }
    }
  }

  return merged;
}

function toGroupResourceId(groupId: string): string {
  return `${GROUP_PREFIX}${groupId}`;
}

function stripGroupPrefix(resourceId: string): string {
  return resourceId.startsWith(GROUP_PREFIX) ? resourceId.slice(GROUP_PREFIX.length) : resourceId;
}
