import { COOLDOWN_GROUP_MAP, COOLDOWN_GROUP_SKILLS_MAP, getSkillDefinition } from '../data/skills';
import type { ResourceEvent, Skill } from '../model/types';
import { BinaryHeap } from './BinaryHeap';
import {
  type BuildMode,
  type ConstraintInterval,
  type CooldownEventBoundary,
  OPEN_ENDED_COOLDOWN_END_MS,
  type ReservationInterval,
  type ResourceState,
  type StackEvent,
  type StackInterval,
  getGroupInitialStack,
  getInitialStack,
  getMaxStack,
  handleBuildFailure,
  normalizeCooldownGroupIds,
  stripGroupPrefix,
  toOwnedGroupResourceKey,
} from './playerCastShared';

export function buildBoundaries(
  stackEvents: BinaryHeap<StackEvent>,
  mode: BuildMode,
): { boundaries: Map<string, CooldownEventBoundary[]>; resourceEvents: ResourceEvent[] } {
  const stacksBuffer = new Map<string, number>();
  const boundaries = new Map<string, CooldownEventBoundary[]>();
  const resourceStates = new Map<string, ResourceState>();
  const groupStackStates = new Map<string, ResourceState>();
  const groupStackIntervals = new Map<string, StackInterval[]>();
  const groupConstraintIntervals = new Map<string, ConstraintInterval[]>();
  const groupOpenCooldownStarts = new Map<string, ConstraintInterval>();
  const groupReservationIntervals = new Map<string, ReservationInterval[]>();
  const ownerKeys = new Set<string | undefined>();
  const resourceEvents: ResourceEvent[] = [];
  const getSkillKey = (skillId: string, ownerKey?: string) =>
    ownerKey ? `${skillId}:${ownerKey}` : skillId;
  let lastStackEventMs = 0;

  for (let stackEvent = stackEvents.pop(); stackEvent; stackEvent = stackEvents.pop()) {
    lastStackEventMs = Math.max(lastStackEventMs, stackEvent.tMs);
    const initialStack = getInitialStack(stackEvent);
    const maxStack = getMaxStack(stackEvent);
    const hasExistingStack = stacksBuffer.has(stackEvent.resourceKey);
    let stack = stacksBuffer.get(stackEvent.resourceKey) ?? initialStack;
    const previousStack = stack;
    const previousStackStartMs = groupStackStates.get(stackEvent.resourceKey)?.startMs ?? 0;
    if (stackEvent.isGroup) {
      ownerKeys.add(stackEvent.ownerKey);
    }

    if (stackEvent.type === 'consume') {
      stack -= stackEvent.amount;
    } else if (stackEvent.type === 'autoRecover') {
      stack = Math.min(maxStack, stack + stackEvent.amount);
    } else if (stackEvent.type === 'expire') {
      stack = Math.max(initialStack, stack - stackEvent.amount);
    } else {
      stack = Math.min(maxStack, stack + stackEvent.amount);
    }

    if (stack < 0) {
      handleBuildFailure(
        mode,
        'NEGATIVE_STACK',
        `错误：${stackEvent.resourceKey}@${stackEvent.tMs} 冷却层数为负，无法构建合法的冷却状态。`,
      );
      stack = 0;
    }

    recordResourceStackChange(
      stackEvent,
      previousStack,
      stack,
      initialStack,
      maxStack,
      resourceStates,
      resourceEvents,
    );
    recordGroupConstraintIntervals(
      stackEvent,
      previousStack,
      stack,
      initialStack,
      hasExistingStack,
      groupConstraintIntervals,
      groupOpenCooldownStarts,
    );
    recordGroupReservationIntervals(
      stackEvent,
      previousStack,
      stack,
      previousStackStartMs,
      groupReservationIntervals,
    );
    recordGroupStackInterval(
      stackEvent,
      previousStack,
      stack,
      initialStack,
      maxStack,
      groupStackStates,
      groupStackIntervals,
    );

    const buildBoundary = (skillId: string): CooldownEventBoundary[] => {
      if (previousStack > 0 && stack === 0) {
        const boundaries: CooldownEventBoundary[] = [];
        const unusableStartMs = getGroupUnusableStartMs(stackEvent);
        if (unusableStartMs !== undefined && unusableStartMs < stackEvent.tMs) {
          boundaries.push(
            {
              skillId,
              resourceId: stackEvent.resourceKey,
              ownerKey: stackEvent.ownerKey,
              ownerJob: stackEvent.ownerJob,
              tMs: unusableStartMs,
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
          );
        }
        boundaries.push({
          skillId,
          resourceId: stackEvent.resourceKey,
          ownerKey: stackEvent.ownerKey,
          ownerJob: stackEvent.ownerJob,
          tMs: stackEvent.tMs,
          boundaryType: 'cooldownStart',
        });
        return boundaries;
      }

      if (previousStack === 0 && stack > 0 && stackEvent.type !== 'consume') {
        const boundaries: CooldownEventBoundary[] = [];
        if (!hasExistingStack && initialStack === 0) {
          boundaries.push({
            skillId,
            resourceId: stackEvent.resourceKey,
            ownerKey: stackEvent.ownerKey,
            ownerJob: stackEvent.ownerJob,
            tMs: 0,
            boundaryType: 'cooldownStart',
          });
        }
        boundaries.push({
          skillId,
          resourceId: stackEvent.resourceKey,
          ownerKey: stackEvent.ownerKey,
          ownerJob: stackEvent.ownerJob,
          tMs: stackEvent.tMs,
          boundaryType: 'cooldownEnd',
        });
        return boundaries;
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
        if (normalizeCooldownGroupIds(skill.cooldownGroup).length > 1) continue;

        const skillKey = getSkillKey(skill.id, stackEvent.ownerKey);
        const boundary = boundaries.get(skillKey) ?? [];
        boundary.push(...buildBoundary(skill.id));
        boundaries.set(skillKey, boundary);
      }
    }

    stacksBuffer.set(stackEvent.resourceKey, stack);
  }

  for (const openInterval of groupOpenCooldownStarts.values()) {
    openInterval.tEndMs = OPEN_ENDED_COOLDOWN_END_MS;
    const intervals = groupConstraintIntervals.get(openInterval.resourceId) ?? [];
    intervals.push(openInterval);
    groupConstraintIntervals.set(openInterval.resourceId, intervals);
  }

  for (const state of groupStackStates.values()) {
    const resourceKey = toOwnedGroupResourceKey(state.resourceGroupId, state.ownerKey);
    const intervals = groupStackIntervals.get(resourceKey) ?? [];
    intervals.push({
      resourceId: resourceKey,
      ownerKey: state.ownerKey,
      ownerJob: state.ownerJob,
      value: state.value,
      tStartMs: state.startMs,
      tEndMs: OPEN_ENDED_COOLDOWN_END_MS,
    });
    groupStackIntervals.set(resourceKey, intervals);
  }

  addSingleGroupReservationBoundaries(
    boundaries,
    groupStackIntervals,
    groupReservationIntervals,
    ownerKeys,
  );
  addMultiGroupBoundaries(
    boundaries,
    groupStackIntervals,
    groupConstraintIntervals,
    groupReservationIntervals,
    ownerKeys,
  );

  for (const state of resourceStates.values()) {
    resourceEvents.push({
      resourceGroupId: state.resourceGroupId,
      ownerKey: state.ownerKey,
      ownerJob: state.ownerJob,
      value: state.value,
      maxValue: state.maxValue,
      tStartMs: state.startMs,
      tEndMs: Math.max(state.startMs, lastStackEventMs),
    });
  }

  return { boundaries, resourceEvents };
}

function recordGroupStackInterval(
  stackEvent: StackEvent,
  previousStack: number,
  nextStack: number,
  initialStack: number,
  maxStack: number,
  groupStackStates: Map<string, ResourceState>,
  groupStackIntervals: Map<string, StackInterval[]>,
) {
  if (!stackEvent.isGroup || previousStack === nextStack) return;

  const resourceGroupId = stripGroupPrefix(stackEvent.resourceKey);
  const currentState =
    groupStackStates.get(stackEvent.resourceKey) ??
    ({
      resourceGroupId,
      ownerKey: stackEvent.ownerKey,
      ownerJob: stackEvent.ownerJob,
      value: initialStack,
      maxValue: maxStack,
      startMs: 0,
    } satisfies ResourceState);

  const intervals = groupStackIntervals.get(stackEvent.resourceKey) ?? [];
  intervals.push({
    resourceId: stackEvent.resourceKey,
    ownerKey: stackEvent.ownerKey,
    ownerJob: stackEvent.ownerJob,
    value: currentState.value,
    tStartMs: currentState.startMs,
    tEndMs: stackEvent.tMs,
  });
  groupStackIntervals.set(stackEvent.resourceKey, intervals);

  groupStackStates.set(stackEvent.resourceKey, {
    ...currentState,
    value: nextStack,
    startMs: stackEvent.tMs,
  });
}

function recordGroupConstraintIntervals(
  stackEvent: StackEvent,
  previousStack: number,
  nextStack: number,
  initialStack: number,
  hasExistingStack: boolean,
  groupConstraintIntervals: Map<string, ConstraintInterval[]>,
  groupOpenCooldownStarts: Map<string, ConstraintInterval>,
) {
  if (!stackEvent.isGroup) return;

  const pushInterval = (interval: ConstraintInterval) => {
    if (interval.tEndMs <= interval.tStartMs) return;
    const intervals = groupConstraintIntervals.get(stackEvent.resourceKey) ?? [];
    intervals.push(interval);
    groupConstraintIntervals.set(stackEvent.resourceKey, intervals);
  };

  if (previousStack > 0 && nextStack === 0) {
    const unusableStartMs = getGroupUnusableStartMs(stackEvent);
    if (unusableStartMs !== undefined) {
      pushInterval({
        cdType: 'unusable',
        resourceId: stackEvent.resourceKey,
        ownerKey: stackEvent.ownerKey,
        ownerJob: stackEvent.ownerJob,
        tStartMs: unusableStartMs,
        tEndMs: stackEvent.tMs,
      });
    }
    groupOpenCooldownStarts.set(stackEvent.resourceKey, {
      cdType: 'cooldown',
      resourceId: stackEvent.resourceKey,
      ownerKey: stackEvent.ownerKey,
      ownerJob: stackEvent.ownerJob,
      tStartMs: stackEvent.tMs,
      tEndMs: OPEN_ENDED_COOLDOWN_END_MS,
    });
    return;
  }

  if (previousStack === 0 && nextStack > 0) {
    const openInterval = groupOpenCooldownStarts.get(stackEvent.resourceKey);
    if (openInterval) {
      groupOpenCooldownStarts.delete(stackEvent.resourceKey);
      pushInterval({
        ...openInterval,
        tEndMs: stackEvent.tMs,
      });
      return;
    }

    if (!hasExistingStack && initialStack === 0) {
      pushInterval({
        cdType: 'cooldown',
        resourceId: stackEvent.resourceKey,
        ownerKey: stackEvent.ownerKey,
        ownerJob: stackEvent.ownerJob,
        tStartMs: 0,
        tEndMs: stackEvent.tMs,
      });
    }
  }
}

function recordGroupReservationIntervals(
  stackEvent: StackEvent,
  previousStack: number,
  nextStack: number,
  previousStackStartMs: number,
  groupReservationIntervals: Map<string, ReservationInterval[]>,
) {
  if (!isManualGroupExhaustingConsume(stackEvent, previousStack, nextStack)) return;
  if (previousStackStartMs >= stackEvent.tMs) return;

  const futureSkill = getSkillDefinition(stackEvent.skillId);
  const futureGroupIds = normalizeCooldownGroupIds(futureSkill?.cooldownGroup);
  if (!futureGroupIds.length) return;

  const intervals = groupReservationIntervals.get(stackEvent.resourceKey) ?? [];
  intervals.push({
    resourceId: stackEvent.resourceKey,
    ownerKey: stackEvent.ownerKey,
    ownerJob: stackEvent.ownerJob,
    futureSkillId: stackEvent.skillId,
    futureGroupIds,
    tStartMs: previousStackStartMs,
    tEndMs: stackEvent.tMs,
  });
  groupReservationIntervals.set(stackEvent.resourceKey, intervals);
}

function isManualGroupExhaustingConsume(
  stackEvent: StackEvent,
  previousStack: number,
  nextStack: number,
) {
  if (!stackEvent.isGroup || stackEvent.type !== 'consume') return false;
  if (previousStack <= 0 || nextStack !== 0) return false;
  const cooldownGroupMeta = COOLDOWN_GROUP_MAP.get(stripGroupPrefix(stackEvent.resourceKey));
  return !cooldownGroupMeta?.recovery;
}

function getGroupUnusableStartMs(stackEvent: StackEvent) {
  if (!stackEvent.isGroup) {
    return stackEvent.cooldownMs > 0 ? stackEvent.tMs - stackEvent.cooldownMs : undefined;
  }
  if (stackEvent.type !== 'consume') return undefined;
  if (stackEvent.cooldownMs > 0) return stackEvent.tMs - stackEvent.cooldownMs;
  return undefined;
}

function addSingleGroupReservationBoundaries(
  boundaries: Map<string, CooldownEventBoundary[]>,
  groupStackIntervals: Map<string, StackInterval[]>,
  groupReservationIntervals: Map<string, ReservationInterval[]>,
  ownerKeys: Set<string | undefined>,
) {
  if (!groupReservationIntervals.size || !ownerKeys.size) return;

  const getSkillKey = (skillId: string, ownerKey?: string) =>
    ownerKey ? `${skillId}:${ownerKey}` : skillId;
  const singleGroupSkillById = new Map<string, Skill>();

  for (const resourceKey of groupReservationIntervals.keys()) {
    const groupId = stripGroupPrefix(resourceKey);
    const skills = COOLDOWN_GROUP_SKILLS_MAP.get(groupId) ?? [];
    for (const skill of skills) {
      if (normalizeCooldownGroupIds(skill.cooldownGroup).length === 1) {
        singleGroupSkillById.set(skill.id, skill);
      }
    }
  }

  for (const skill of singleGroupSkillById.values()) {
    const groupIds = normalizeCooldownGroupIds(skill.cooldownGroup);
    for (const ownerKey of ownerKeys) {
      const intervals = buildSkillReservationIntervals(
        groupIds,
        ownerKey,
        groupStackIntervals,
        groupReservationIntervals,
      );
      if (!intervals.length) continue;

      const skillKey = getSkillKey(skill.id, ownerKey);
      const skillBoundaries = boundaries.get(skillKey) ?? [];
      for (const interval of intervals) {
        pushConstraintIntervalBoundaries(skillBoundaries, skill.id, ownerKey, interval);
      }
      boundaries.set(skillKey, skillBoundaries);
    }
  }
}

function addMultiGroupBoundaries(
  boundaries: Map<string, CooldownEventBoundary[]>,
  groupStackIntervals: Map<string, StackInterval[]>,
  groupConstraintIntervals: Map<string, ConstraintInterval[]>,
  groupReservationIntervals: Map<string, ReservationInterval[]>,
  ownerKeys: Set<string | undefined>,
) {
  const multiGroupSkills = collectMultiGroupSkills(
    groupStackIntervals,
    groupConstraintIntervals,
    groupReservationIntervals,
  );
  if (!multiGroupSkills.length || !ownerKeys.size) return;

  const getSkillKey = (skillId: string, ownerKey?: string) =>
    ownerKey ? `${skillId}:${ownerKey}` : skillId;

  for (const skill of multiGroupSkills) {
    const groupIds = normalizeCooldownGroupIds(skill.cooldownGroup);
    for (const ownerKey of ownerKeys) {
      const intervals = buildMultiGroupSkillConstraintIntervals(
        groupIds,
        ownerKey,
        groupStackIntervals,
        groupConstraintIntervals,
        groupReservationIntervals,
      );
      if (!intervals.length) continue;

      const skillKey = getSkillKey(skill.id, ownerKey);
      const skillBoundaries = boundaries.get(skillKey) ?? [];
      for (const interval of intervals) {
        pushConstraintIntervalBoundaries(skillBoundaries, skill.id, ownerKey, interval);
      }
      boundaries.set(skillKey, skillBoundaries);
    }
  }
}

function pushConstraintIntervalBoundaries(
  boundaries: CooldownEventBoundary[],
  skillId: string,
  ownerKey: string | undefined,
  interval: ConstraintInterval,
) {
  const boundaryTypes =
    interval.cdType === 'unusable'
      ? (['unusedStart', 'unusedEnd'] as const)
      : (['cooldownStart', 'cooldownEnd'] as const);

  boundaries.push(
    {
      skillId,
      resourceId: interval.resourceId,
      ownerKey,
      ownerJob: interval.ownerJob,
      tMs: interval.tStartMs,
      boundaryType: boundaryTypes[0],
    },
    {
      skillId,
      resourceId: interval.resourceId,
      ownerKey,
      ownerJob: interval.ownerJob,
      tMs: interval.tEndMs,
      boundaryType: boundaryTypes[1],
    },
  );
}

function collectMultiGroupSkills(
  groupStackIntervals: Map<string, StackInterval[]>,
  groupConstraintIntervals: Map<string, ConstraintInterval[]>,
  groupReservationIntervals: Map<string, ReservationInterval[]>,
) {
  const groupIds = new Set<string>();
  for (const resourceKey of groupStackIntervals.keys()) {
    groupIds.add(stripGroupPrefix(resourceKey));
  }
  for (const resourceKey of groupConstraintIntervals.keys()) {
    groupIds.add(stripGroupPrefix(resourceKey));
  }
  for (const resourceKey of groupReservationIntervals.keys()) {
    groupIds.add(stripGroupPrefix(resourceKey));
  }

  const skillById = new Map<string, Skill>();
  for (const groupId of groupIds) {
    const skills = COOLDOWN_GROUP_SKILLS_MAP.get(groupId) ?? [];
    for (const skill of skills) {
      if (normalizeCooldownGroupIds(skill.cooldownGroup).length > 1) {
        skillById.set(skill.id, skill);
      }
    }
  }

  return [...skillById.values()];
}

function buildMultiGroupSkillConstraintIntervals(
  groupIds: string[],
  ownerKey: string | undefined,
  groupStackIntervals: Map<string, StackInterval[]>,
  groupConstraintIntervals: Map<string, ConstraintInterval[]>,
  groupReservationIntervals: Map<string, ReservationInterval[]>,
) {
  const boundaryTimes = collectMultiGroupBoundaryTimes(
    groupIds,
    ownerKey,
    groupStackIntervals,
    groupConstraintIntervals,
    groupReservationIntervals,
  );
  const intervals: ConstraintInterval[] = [];
  let currentInterval: ConstraintInterval | undefined;

  for (const tMs of boundaryTimes) {
    const selectedGroupId = selectGroupByStack(groupIds, ownerKey, tMs, groupStackIntervals);
    const resourceKey = toOwnedGroupResourceKey(selectedGroupId, ownerKey);
    const selectedStack = getStackValueAt(selectedGroupId, ownerKey, tMs, groupStackIntervals);
    const blocker =
      getConstraintAt(resourceKey, tMs, selectedStack, groupConstraintIntervals) ??
      getReservationConstraintAt(
        groupIds,
        selectedGroupId,
        ownerKey,
        tMs,
        groupStackIntervals,
        groupReservationIntervals,
      );

    if (currentInterval && currentInterval.cdType === blocker?.cdType) {
      continue;
    }

    if (currentInterval) {
      currentInterval.tEndMs = tMs;
      if (currentInterval.tEndMs > currentInterval.tStartMs) {
        intervals.push(currentInterval);
      }
      currentInterval = undefined;
    }

    if (blocker) {
      currentInterval = {
        cdType: blocker.cdType,
        resourceId: resourceKey,
        ownerKey,
        ownerJob: blocker.ownerJob,
        tStartMs: tMs,
        tEndMs: OPEN_ENDED_COOLDOWN_END_MS,
      };
    }
  }

  if (currentInterval) {
    intervals.push(currentInterval);
  }

  return intervals;
}

function collectMultiGroupBoundaryTimes(
  groupIds: string[],
  ownerKey: string | undefined,
  groupStackIntervals: Map<string, StackInterval[]>,
  groupConstraintIntervals: Map<string, ConstraintInterval[]>,
  groupReservationIntervals: Map<string, ReservationInterval[]>,
) {
  const boundaryTimes = new Set<number>([0]);

  for (const groupId of groupIds) {
    const stackIntervals = getGroupStackIntervals(groupId, ownerKey, groupStackIntervals);
    for (const interval of stackIntervals) {
      boundaryTimes.add(interval.tStartMs);
      if (interval.tEndMs !== OPEN_ENDED_COOLDOWN_END_MS) {
        boundaryTimes.add(interval.tEndMs);
      }
    }

    const constraintIntervals = getGroupConstraintIntervals(
      groupId,
      ownerKey,
      groupConstraintIntervals,
    );
    for (const interval of constraintIntervals) {
      boundaryTimes.add(interval.tStartMs);
      if (interval.tEndMs !== OPEN_ENDED_COOLDOWN_END_MS) {
        boundaryTimes.add(interval.tEndMs);
      }
    }

    const reservationIntervals = getGroupReservationIntervals(
      groupId,
      ownerKey,
      groupReservationIntervals,
    );
    for (const interval of reservationIntervals) {
      boundaryTimes.add(interval.tStartMs);
      boundaryTimes.add(interval.tEndMs);
    }
  }

  return [...boundaryTimes].sort((a, b) => a - b);
}

function buildSkillReservationIntervals(
  groupIds: string[],
  ownerKey: string | undefined,
  groupStackIntervals: Map<string, StackInterval[]>,
  groupReservationIntervals: Map<string, ReservationInterval[]>,
) {
  const boundaryTimes = collectReservationBoundaryTimes(
    groupIds,
    ownerKey,
    groupStackIntervals,
    groupReservationIntervals,
  );
  const intervals: ConstraintInterval[] = [];
  let currentInterval: ConstraintInterval | undefined;

  for (const tMs of boundaryTimes) {
    const selectedGroupId = selectGroupByStack(groupIds, ownerKey, tMs, groupStackIntervals);
    const blocker = getReservationConstraintAt(
      groupIds,
      selectedGroupId,
      ownerKey,
      tMs,
      groupStackIntervals,
      groupReservationIntervals,
    );

    if (currentInterval && currentInterval.resourceId === blocker?.resourceId) {
      continue;
    }

    if (currentInterval) {
      currentInterval.tEndMs = tMs;
      if (currentInterval.tEndMs > currentInterval.tStartMs) {
        intervals.push(currentInterval);
      }
      currentInterval = undefined;
    }

    if (blocker) {
      currentInterval = {
        ...blocker,
        tStartMs: tMs,
        tEndMs: OPEN_ENDED_COOLDOWN_END_MS,
      };
    }
  }

  if (currentInterval) {
    intervals.push(currentInterval);
  }

  return intervals;
}

function collectReservationBoundaryTimes(
  groupIds: string[],
  ownerKey: string | undefined,
  groupStackIntervals: Map<string, StackInterval[]>,
  groupReservationIntervals: Map<string, ReservationInterval[]>,
) {
  const boundaryTimes = new Set<number>([0]);

  for (const groupId of groupIds) {
    const stackIntervals = getGroupStackIntervals(groupId, ownerKey, groupStackIntervals);
    for (const interval of stackIntervals) {
      boundaryTimes.add(interval.tStartMs);
      if (interval.tEndMs !== OPEN_ENDED_COOLDOWN_END_MS) {
        boundaryTimes.add(interval.tEndMs);
      }
    }

    const reservationIntervals = getGroupReservationIntervals(
      groupId,
      ownerKey,
      groupReservationIntervals,
    );
    for (const interval of reservationIntervals) {
      boundaryTimes.add(interval.tStartMs);
      boundaryTimes.add(interval.tEndMs);
    }
  }

  return [...boundaryTimes].sort((a, b) => a - b);
}

function getReservationConstraintAt(
  groupIds: string[],
  selectedGroupId: string,
  ownerKey: string | undefined,
  tMs: number,
  groupStackIntervals: Map<string, StackInterval[]>,
  groupReservationIntervals: Map<string, ReservationInterval[]>,
): ConstraintInterval | undefined {
  const resourceKey = toOwnedGroupResourceKey(selectedGroupId, ownerKey);
  const reservations = groupReservationIntervals.get(resourceKey) ?? [];
  const reservation = reservations.find(
    (item) =>
      item.tStartMs <= tMs &&
      tMs < item.tEndMs &&
      doesReservationBlockSkill(groupIds, selectedGroupId, ownerKey, item, groupStackIntervals),
  );
  if (!reservation) return undefined;

  return {
    cdType: 'unusable',
    resourceId: resourceKey,
    ownerKey,
    ownerJob: reservation.ownerJob,
    tStartMs: reservation.tStartMs,
    tEndMs: reservation.tEndMs,
  };
}

function doesReservationBlockSkill(
  groupIds: string[],
  selectedGroupId: string,
  ownerKey: string | undefined,
  reservation: ReservationInterval,
  groupStackIntervals: Map<string, StackInterval[]>,
) {
  if (!groupIds.includes(selectedGroupId)) return false;

  return !reservation.futureGroupIds.some((futureGroupId) => {
    const futureStack = getStackValueBefore(
      futureGroupId,
      ownerKey,
      reservation.tEndMs,
      groupStackIntervals,
    );
    const adjustedFutureStack = futureGroupId === selectedGroupId ? futureStack - 1 : futureStack;
    return adjustedFutureStack > 0;
  });
}

function selectGroupByStack(
  groupIds: string[],
  ownerKey: string | undefined,
  tMs: number,
  groupStackIntervals: Map<string, StackInterval[]>,
) {
  for (const groupId of groupIds) {
    const value = getStackValueAt(groupId, ownerKey, tMs, groupStackIntervals);
    if (value > 0) return groupId;
  }

  return groupIds[0];
}

function getStackValueAt(
  groupId: string,
  ownerKey: string | undefined,
  tMs: number,
  groupStackIntervals: Map<string, StackInterval[]>,
) {
  const interval = getGroupStackIntervals(groupId, ownerKey, groupStackIntervals).find(
    (item) => item.tStartMs <= tMs && tMs < item.tEndMs,
  );
  return interval?.value ?? 0;
}

function getStackValueBefore(
  groupId: string,
  ownerKey: string | undefined,
  tMs: number,
  groupStackIntervals: Map<string, StackInterval[]>,
) {
  const interval = getGroupStackIntervals(groupId, ownerKey, groupStackIntervals).find(
    (item) => item.tStartMs < tMs && tMs <= item.tEndMs,
  );
  return interval?.value ?? 0;
}

function getConstraintAt(
  resourceKey: string,
  tMs: number,
  currentStack: number,
  groupConstraintIntervals: Map<string, ConstraintInterval[]>,
) {
  const intervals = groupConstraintIntervals.get(resourceKey) ?? [];
  const cooldown = intervals.find(
    (interval) =>
      interval.cdType === 'cooldown' && interval.tStartMs <= tMs && tMs < interval.tEndMs,
  );
  if (cooldown) return cooldown;

  return (
    intervals.find(
      (interval) =>
        interval.cdType === 'unusable' && interval.tStartMs <= tMs && tMs < interval.tEndMs,
    ) ?? getDefaultConstraintAt(resourceKey, tMs, currentStack)
  );
}

function getDefaultConstraintAt(
  resourceKey: string,
  tMs: number,
  currentStack: number,
): ConstraintInterval | undefined {
  const groupId = stripGroupPrefix(resourceKey);
  const cooldownGroupMeta = COOLDOWN_GROUP_MAP.get(groupId);
  if (tMs < 0 || tMs >= OPEN_ENDED_COOLDOWN_END_MS) return undefined;
  if (currentStack > 0) return undefined;
  if (getGroupInitialStack(cooldownGroupMeta) > 0) return undefined;

  return {
    cdType: 'cooldown',
    resourceId: resourceKey,
    tStartMs: 0,
    tEndMs: OPEN_ENDED_COOLDOWN_END_MS,
  };
}

function getGroupStackIntervals(
  groupId: string,
  ownerKey: string | undefined,
  groupStackIntervals: Map<string, StackInterval[]>,
) {
  const resourceKey = toOwnedGroupResourceKey(groupId, ownerKey);
  const intervals = groupStackIntervals.get(resourceKey);
  if (intervals) return intervals;

  const cooldownGroupMeta = COOLDOWN_GROUP_MAP.get(groupId);
  return [
    {
      resourceId: resourceKey,
      ownerKey,
      value: getGroupInitialStack(cooldownGroupMeta),
      tStartMs: 0,
      tEndMs: OPEN_ENDED_COOLDOWN_END_MS,
    } satisfies StackInterval,
  ];
}

function getGroupConstraintIntervals(
  groupId: string,
  ownerKey: string | undefined,
  groupConstraintIntervals: Map<string, ConstraintInterval[]>,
) {
  const resourceKey = toOwnedGroupResourceKey(groupId, ownerKey);
  const intervals = groupConstraintIntervals.get(resourceKey);
  if (intervals) return intervals;

  const cooldownGroupMeta = COOLDOWN_GROUP_MAP.get(groupId);
  if (getGroupInitialStack(cooldownGroupMeta) > 0) return [];

  return [
    {
      cdType: 'cooldown',
      resourceId: resourceKey,
      ownerKey,
      tStartMs: 0,
      tEndMs: OPEN_ENDED_COOLDOWN_END_MS,
    } satisfies ConstraintInterval,
  ];
}

function getGroupReservationIntervals(
  groupId: string,
  ownerKey: string | undefined,
  groupReservationIntervals: Map<string, ReservationInterval[]>,
) {
  const resourceKey = toOwnedGroupResourceKey(groupId, ownerKey);
  return groupReservationIntervals.get(resourceKey) ?? [];
}

function recordResourceStackChange(
  stackEvent: StackEvent,
  previousStack: number,
  nextStack: number,
  initialStack: number,
  maxStack: number,
  resourceStates: Map<string, ResourceState>,
  resourceEvents: ResourceEvent[],
) {
  if (!stackEvent.isGroup || previousStack === nextStack) return;

  const resourceGroupId = stripGroupPrefix(stackEvent.resourceKey);
  const cooldownGroupMeta = COOLDOWN_GROUP_MAP.get(resourceGroupId);
  if (!cooldownGroupMeta?.resourceDisplay) return;

  const currentState =
    resourceStates.get(stackEvent.resourceKey) ??
    ({
      resourceGroupId,
      ownerKey: stackEvent.ownerKey,
      ownerJob: stackEvent.ownerJob,
      value: initialStack,
      maxValue: maxStack,
      startMs: 0,
    } satisfies ResourceState);

  resourceEvents.push({
    resourceGroupId: currentState.resourceGroupId,
    ownerKey: currentState.ownerKey,
    ownerJob: currentState.ownerJob,
    value: currentState.value,
    maxValue: currentState.maxValue,
    tStartMs: currentState.startMs,
    tEndMs: stackEvent.tMs,
  });

  resourceStates.set(stackEvent.resourceKey, {
    ...currentState,
    value: nextStack,
    startMs: stackEvent.tMs,
  });
}
