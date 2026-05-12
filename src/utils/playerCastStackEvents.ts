import { MS_PER_SEC } from '../constants/time';
import { COOLDOWN_GROUP_MAP, getSkillDefinition, normalizeSkillId } from '../data/skills';
import type { Job, MitEvent } from '../model/types';
import { BinaryHeap } from './BinaryHeap';
import {
  type BuildMode,
  type StackEvent,
  buildOwnerKey,
  getGroupInitialStack,
  getInitialStack,
  getMaxStack,
  handleBuildFailure,
  normalizeCooldownGroupIds,
  sortMitEvents,
  toGroupResourceId,
} from './playerCastShared';

const stackEventOrder: Record<StackEvent['type'], number> = {
  autoRecover: 0,
  skillRecover: 0,
  expire: 1,
  consume: 2,
};

export function buildStackEvents(mitEvents: MitEvent[], mode: BuildMode): BinaryHeap<StackEvent> {
  const stackEvents: BinaryHeap<StackEvent> = new BinaryHeap<StackEvent>(
    (a, b) => a.tMs - b.tMs || stackEventOrder[a.type] - stackEventOrder[b.type],
  );
  const pendingGroupEvents: BinaryHeap<StackEvent> = new BinaryHeap<StackEvent>(
    (a, b) => a.tMs - b.tMs || stackEventOrder[a.type] - stackEventOrder[b.type],
  );
  const initializedGroupResourceKeys = new Set<string>();
  const groupStacks = new Map<string, number>();

  const getGroupStack = (resourceKey: string) => {
    if (groupStacks.has(resourceKey)) return groupStacks.get(resourceKey) ?? 0;

    const stackEvent = {
      resourceKey,
      isGroup: true,
      type: 'skillRecover',
      amount: 0,
      cooldownMs: 0,
      tMs: 0,
      skillId: '',
    } satisfies StackEvent;
    const initialStack = getInitialStack(stackEvent);
    groupStacks.set(resourceKey, initialStack);
    return initialStack;
  };

  const scheduleGroupEvent = (stackEvent: StackEvent, processImmediately: boolean) => {
    stackEvents.push(stackEvent);
    if (processImmediately) {
      applyGroupStackEvent(stackEvent, groupStacks, scheduleGroupEvent, mode);
    } else {
      pendingGroupEvents.push(stackEvent);
    }
  };

  const flushPendingGroupEvents = (tMs: number) => {
    for (let stackEvent = pendingGroupEvents.peek(); stackEvent && stackEvent.tMs <= tMs; ) {
      pendingGroupEvents.pop();
      applyGroupStackEvent(stackEvent, groupStacks, scheduleGroupEvent, mode);
      stackEvent = pendingGroupEvents.peek();
    }
  };

  const pushInitialGroupRecovery = (
    groupId: string,
    groupResourceKey: string,
    ownerKey: string | undefined,
    ownerJob: Job | undefined,
    skillId: string,
  ) => {
    if (initializedGroupResourceKeys.has(groupResourceKey)) return;
    initializedGroupResourceKeys.add(groupResourceKey);

    const cooldownGroupMeta = COOLDOWN_GROUP_MAP.get(groupId);
    const initialStack = getGroupInitialStack(cooldownGroupMeta);
    const maxStack = cooldownGroupMeta?.stack ?? 1;
    const recoveryMs = (cooldownGroupMeta?.recovery?.cooldownSec ?? 0) * MS_PER_SEC;
    if (initialStack >= maxStack || recoveryMs <= 0) return;

    scheduleGroupEvent(
      {
        resourceKey: groupResourceKey,
        ownerKey,
        ownerJob,
        skillId,
        isGroup: true,
        type: 'autoRecover',
        amount: 1,
        cooldownMs: recoveryMs,
        tMs: recoveryMs,
      },
      false,
    );
  };

  const sortedEvents = sortMitEvents(mitEvents);
  for (let index = 0; index < sortedEvents.length; ) {
    const tStartMs = sortedEvents[index].tStartMs;
    const sameTimeEvents: MitEvent[] = [];
    while (index < sortedEvents.length && sortedEvents[index].tStartMs === tStartMs) {
      sameTimeEvents.push(sortedEvents[index]);
      index++;
    }

    flushPendingGroupEvents(tStartMs);

    for (const event of sameTimeEvents) {
      pushSkillSelfCooldown(stackEvents, event, mode);
      pushSkillRecoveries(event, mode, scheduleGroupEvent, pushInitialGroupRecovery);
    }

    flushPendingGroupEvents(tStartMs);

    for (const event of sameTimeEvents) {
      pushSkillGroupConsume(
        event,
        mode,
        scheduleGroupEvent,
        pushInitialGroupRecovery,
        flushPendingGroupEvents,
        getGroupStack,
      );
    }
  }

  flushPendingGroupEvents(Number.MAX_SAFE_INTEGER);

  return stackEvents;
}

function pushSkillSelfCooldown(
  stackEvents: BinaryHeap<StackEvent>,
  event: MitEvent,
  mode: BuildMode,
) {
  const baseSkillId = normalizeSkillId(event.skillId);
  const skillMeta = getSkillDefinition(baseSkillId);

  if (!skillMeta) {
    handleBuildFailure(mode, 'UNKNOWN_SKILL', `致命错误：未找到技能 ${baseSkillId} 的定义。`);
    return;
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
    amount: 1,
    cooldownMs: skillCooldownMs,
    tMs: event.tStartMs,
  });
  if (skillCooldownMs > 0) {
    stackEvents.push({
      resourceKey: skillResourceKey,
      ownerKey,
      ownerJob: event.ownerJob,
      skillId: baseSkillId,
      isGroup: false,
      type: 'autoRecover',
      amount: 1,
      cooldownMs: skillCooldownMs,
      tMs: event.tStartMs + skillCooldownMs,
    });
  }
}

function pushSkillRecoveries(
  event: MitEvent,
  mode: BuildMode,
  scheduleGroupEvent: (stackEvent: StackEvent, processImmediately: boolean) => void,
  pushInitialGroupRecovery: (
    groupId: string,
    groupResourceKey: string,
    ownerKey: string | undefined,
    ownerJob: Job | undefined,
    skillId: string,
  ) => void,
) {
  const baseSkillId = normalizeSkillId(event.skillId);
  const skillMeta = getSkillDefinition(baseSkillId);

  if (!skillMeta) {
    handleBuildFailure(mode, 'UNKNOWN_SKILL', `致命错误：未找到技能 ${baseSkillId} 的定义。`);
    return;
  }

  const ownerKey = buildOwnerKey(event.ownerId, event.ownerJob);
  for (const recovery of skillMeta.cooldownGroupRecoveries ?? []) {
    const recoveryGroupMeta = COOLDOWN_GROUP_MAP.get(recovery.groupId);
    if (!recoveryGroupMeta) {
      handleBuildFailure(
        mode,
        'UNKNOWN_GROUP',
        `致命错误：未找到技能组 ${recovery.groupId} 的定义。`,
      );
      continue;
    }

    const recoveryGroupResourceBase = toGroupResourceId(recovery.groupId);
    const recoveryGroupResourceKey = ownerKey
      ? `${recoveryGroupResourceBase}:${ownerKey}`
      : recoveryGroupResourceBase;
    pushInitialGroupRecovery(
      recovery.groupId,
      recoveryGroupResourceKey,
      ownerKey,
      event.ownerJob,
      baseSkillId,
    );
    scheduleGroupEvent(
      {
        resourceKey: recoveryGroupResourceKey,
        ownerKey,
        ownerJob: event.ownerJob,
        skillId: baseSkillId,
        isGroup: true,
        type: 'skillRecover',
        amount: recovery.amount ?? 1,
        cooldownMs: 0,
        tMs: event.tStartMs,
      },
      true,
    );

    if (recovery.expires?.kind === 'skillEnd') {
      scheduleGroupEvent(
        {
          resourceKey: recoveryGroupResourceKey,
          ownerKey,
          ownerJob: event.ownerJob,
          skillId: baseSkillId,
          isGroup: true,
          type: 'expire',
          amount: recovery.amount ?? 1,
          cooldownMs: 0,
          tMs: event.tEndMs,
        },
        false,
      );
    }
  }
}

function pushSkillGroupConsume(
  event: MitEvent,
  mode: BuildMode,
  scheduleGroupEvent: (stackEvent: StackEvent, processImmediately: boolean) => void,
  pushInitialGroupRecovery: (
    groupId: string,
    groupResourceKey: string,
    ownerKey: string | undefined,
    ownerJob: Job | undefined,
    skillId: string,
  ) => void,
  flushPendingGroupEvents: (tMs: number) => void,
  getGroupStack: (resourceKey: string) => number,
) {
  const baseSkillId = normalizeSkillId(event.skillId);
  const skillMeta = getSkillDefinition(baseSkillId);

  if (!skillMeta) {
    handleBuildFailure(mode, 'UNKNOWN_SKILL', `致命错误：未找到技能 ${baseSkillId} 的定义。`);
    return;
  }

  const ownerKey = buildOwnerKey(event.ownerId, event.ownerJob);
  for (const groupId of normalizeCooldownGroupIds(skillMeta.cooldownGroup)) {
    const groupResourceBase = toGroupResourceId(groupId);
    const groupResourceKey = ownerKey ? `${groupResourceBase}:${ownerKey}` : groupResourceBase;
    pushInitialGroupRecovery(groupId, groupResourceKey, ownerKey, event.ownerJob, baseSkillId);
  }
  flushPendingGroupEvents(event.tStartMs);

  const skillGroupId = chooseCooldownGroup(skillMeta.cooldownGroup, ownerKey, getGroupStack);
  if (!skillGroupId) return;

  const cooldownGroupMeta = COOLDOWN_GROUP_MAP.get(skillGroupId);
  if (!cooldownGroupMeta) {
    handleBuildFailure(mode, 'UNKNOWN_GROUP', `致命错误：未找到技能组 ${skillGroupId} 的定义。`);
    return;
  }

  const groupCooldownMs = (cooldownGroupMeta.recovery?.cooldownSec ?? 0) * MS_PER_SEC;
  const groupResourceBase = toGroupResourceId(skillGroupId);
  const groupResourceKey = ownerKey ? `${groupResourceBase}:${ownerKey}` : groupResourceBase;
  scheduleGroupEvent(
    {
      resourceKey: groupResourceKey,
      ownerKey,
      ownerJob: event.ownerJob,
      skillId: baseSkillId,
      isGroup: true,
      type: 'consume',
      amount: 1,
      cooldownMs: groupCooldownMs,
      tMs: event.tStartMs,
    },
    true,
  );
}

function chooseCooldownGroup(
  cooldownGroup: string | string[] | undefined,
  ownerKey: string | undefined,
  getGroupStack: (resourceKey: string) => number,
) {
  const groupIds = normalizeCooldownGroupIds(cooldownGroup);
  if (!groupIds.length) return undefined;

  for (const groupId of groupIds) {
    const groupResourceBase = toGroupResourceId(groupId);
    const groupResourceKey = ownerKey ? `${groupResourceBase}:${ownerKey}` : groupResourceBase;
    if (getGroupStack(groupResourceKey) > 0) return groupId;
  }

  return groupIds[0];
}

function applyGroupStackEvent(
  stackEvent: StackEvent,
  groupStacks: Map<string, number>,
  scheduleGroupEvent: (stackEvent: StackEvent, processImmediately: boolean) => void,
  mode: BuildMode,
) {
  const initialStack = getInitialStack(stackEvent);
  const maxStack = getMaxStack(stackEvent);
  let stack = groupStacks.get(stackEvent.resourceKey) ?? initialStack;

  if (stackEvent.type === 'consume') {
    if (stack === maxStack && stackEvent.cooldownMs > 0) {
      scheduleGroupEvent(
        {
          ...stackEvent,
          type: 'autoRecover',
          amount: 1,
          tMs: stackEvent.tMs + stackEvent.cooldownMs,
        },
        false,
      );
    }
    stack -= stackEvent.amount;
  } else if (stackEvent.type === 'expire') {
    stack = Math.max(initialStack, stack - stackEvent.amount);
  } else {
    stack = Math.min(maxStack, stack + stackEvent.amount);
    if (stackEvent.type === 'autoRecover' && stack < maxStack && stackEvent.cooldownMs > 0) {
      scheduleGroupEvent(
        {
          ...stackEvent,
          amount: 1,
          tMs: stackEvent.tMs + stackEvent.cooldownMs,
        },
        false,
      );
    }
  }

  if (stack < 0) {
    handleBuildFailure(
      mode,
      'NEGATIVE_STACK',
      `错误：${stackEvent.resourceKey}@${stackEvent.tMs} 冷却层数为负，无法构建合法的冷却状态。`,
    );
    stack = 0;
  }

  groupStacks.set(stackEvent.resourceKey, stack);
}
