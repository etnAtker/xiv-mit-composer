import test from 'node:test';
import assert from 'node:assert/strict';

import type { Job, MitEvent } from '../src/model/types';
import {
  buildMitEventFromSkill,
  buildClearedDurationEndMitEvents,
  buildDurationEndMitEvents,
  buildMovedMitEvents,
  buildUpdatedDurationEndMitEvents,
  canDropExistingMitigations,
  canDropNewMitigation,
  canUpdateDurationEnd,
  resolveDropCenterMs,
  prepareExistingMitDrag,
  resolveDropStartMs,
  resolveEventsToMove,
  resolveMitRemovalIds,
} from '../src/domain/drag/mitigationDrag';

function createMitEvent(
  skillId: string,
  tStartMs: number,
  ownerJob: Job,
  ownerId = 1,
  durationMs = 10000,
): MitEvent {
  return {
    eventType: 'mit',
    id: `${skillId}-${tStartMs}-${ownerId}`,
    skillId,
    tStartMs,
    durationMs,
    tEndMs: tStartMs + durationMs,
    ownerJob,
    ownerId,
  };
}

test('resolveEventsToMove 在未选中当前条目时只返回当前事件', () => {
  const a = createMitEvent('role-rampart', 10_000, 'PLD', 1);
  const b = createMitEvent('role-reprisal:WAR', 20_000, 'WAR', 2);

  assert.deepEqual(resolveEventsToMove(a, [b.id], [a, b]), [a]);
});

test('prepareExistingMitDrag 会基于选中项生成移动上下文', () => {
  const a = createMitEvent('role-rampart', 10_000, 'PLD', 1);
  const b = createMitEvent('role-reprisal:WAR', 20_000, 'WAR', 2);

  const result = prepareExistingMitDrag(a, [a.id, b.id], [a, b]);

  assert.deepEqual(result.eventsToMove, [a, b]);
});

test('resolveDropStartMs 会把拖拽落点转换为时间', () => {
  assert.equal(resolveDropStartMs(180, 80, 100), 10_000);
});

test('resolveDropCenterMs 会用拖拽矩形中心转换为时间', () => {
  assert.equal(resolveDropCenterMs(180, 20, 80, 100), 11_000);
});

test('resolveMitRemovalIds 会按当前是否被选中决定删除范围', () => {
  const a = createMitEvent('role-rampart', 10_000, 'PLD', 1);

  assert.deepEqual(resolveMitRemovalIds(a, ['x', a.id]), ['x', a.id]);
  assert.deepEqual(resolveMitRemovalIds(a, ['x']), [a.id]);
});

test('buildMitEventFromSkill 会生成带 owner 的减伤事件', () => {
  const mit = buildMitEventFromSkill({
    skillId: 'role-reprisal',
    tStartMs: 15_000,
    id: 'mit-1',
    ownerJob: 'PLD',
    ownerId: 42,
  });

  assert.ok(mit);
  if (!mit) {
    throw new Error('期望生成减伤事件');
  }
  assert.equal(mit.id, 'mit-1');
  assert.equal(mit.skillId, 'role-reprisal@PLD');
  assert.equal(mit.ownerJob, 'PLD');
  assert.equal(mit.ownerId, 42);
  assert.equal(mit.tEndMs, mit.tStartMs + mit.durationMs);
});

test('canDropNewMitigation 会复用合法性校验结果', () => {
  const events = [createMitEvent('role-rampart', 10_000, 'PLD', 1)];
  const context = prepareExistingMitDrag(
    createMitEvent('role-reprisal@PLD', 50_000, 'PLD', 1),
    [],
    events,
  );

  assert.equal(
    canDropNewMitigation('role-rampart', 20_000, events, context.cooldownEvents, {
      ownerJob: 'PLD',
      ownerId: 1,
    }),
    false,
  );
  assert.equal(
    canDropNewMitigation('role-rampart', 120_000, events, context.cooldownEvents, {
      ownerJob: 'PLD',
      ownerId: 1,
    }),
    true,
  );
});

test('小宇宙拖入大宇宙持续窗口时会更新父事件', () => {
  const events = [createMitEvent('ast-macrocosmos', 10_000, 'AST', 100, 15_000)];

  assert.equal(
    canDropNewMitigation('ast-microcosmos', 18_000, events, [], {
      ownerJob: 'AST',
      ownerId: 100,
    }),
    true,
  );
  assert.equal(
    canDropNewMitigation('ast-microcosmos', 30_000, events, [], {
      ownerJob: 'AST',
      ownerId: 100,
    }),
    false,
  );

  const updated = buildDurationEndMitEvents('ast-microcosmos', 18_000, events, {
    ownerJob: 'AST',
    ownerId: 100,
  });

  assert.deepEqual(
    updated?.map((event) => ({
      skillId: event.skillId,
      tEndMs: event.tEndMs,
      durationMs: event.durationMs,
      endedBy: event.endedBy,
    })),
    [
      {
        skillId: 'ast-macrocosmos',
        tEndMs: 18_000,
        durationMs: 8_000,
        endedBy: {
          skillId: 'ast-microcosmos',
          tMs: 18_000,
        },
      },
    ],
  );
});

test('已存在的持续结束标记可以移动并清除', () => {
  const events = [
    {
      ...createMitEvent('ast-macrocosmos', 10_000, 'AST', 100, 8_000),
      endedBy: {
        skillId: 'ast-microcosmos',
        tMs: 18_000,
      },
    },
  ];

  assert.equal(canUpdateDurationEnd(events[0].id, 20_000, events), true);
  assert.equal(canUpdateDurationEnd(events[0].id, 26_000, events), false);

  const moved = buildUpdatedDurationEndMitEvents(events[0].id, 'ast-microcosmos', 20_000, events);
  assert.deepEqual(
    moved?.map((event) => ({
      tEndMs: event.tEndMs,
      durationMs: event.durationMs,
      endedBy: event.endedBy,
    })),
    [
      {
        tEndMs: 20_000,
        durationMs: 10_000,
        endedBy: {
          skillId: 'ast-microcosmos',
          tMs: 20_000,
        },
      },
    ],
  );

  const cleared = buildClearedDurationEndMitEvents(events[0].id, events);
  assert.deepEqual(
    cleared?.map((event) => ({
      tEndMs: event.tEndMs,
      durationMs: event.durationMs,
      endedBy: event.endedBy,
    })),
    [
      {
        tEndMs: 25_000,
        durationMs: 15_000,
        endedBy: undefined,
      },
    ],
  );
});

test('buildMovedMitEvents 会生成整体平移后的结果', () => {
  const a = createMitEvent('role-rampart', 10_000, 'PLD', 1);
  const b = createMitEvent('role-reprisal@PLD', 30_000, 'PLD', 1);
  const context = prepareExistingMitDrag(a, [a.id, b.id], [a, b]);

  const moved = buildMovedMitEvents({
    sourceMit: a,
    tStartMs: 20_000,
    eventsToMove: context.eventsToMove,
    mitEvents: [a, b],
  });

  assert.deepEqual(
    moved?.map((mit) => ({ id: mit.id, tStartMs: mit.tStartMs, tEndMs: mit.tEndMs })),
    [
      { id: a.id, tStartMs: 20_000, tEndMs: 30_000 },
      { id: b.id, tStartMs: 40_000, tEndMs: 50_000 },
    ],
  );
});

test('canDropExistingMitigations 在目标时间冲突时返回 false', () => {
  const moving = createMitEvent('role-rampart', 10_000, 'PLD', 1);
  const blocker = createMitEvent('role-rampart', 120_000, 'PLD', 1);
  const context = prepareExistingMitDrag(moving, [moving.id], [moving, blocker]);

  assert.equal(
    canDropExistingMitigations({
      sourceMit: moving,
      tStartMs: 100_000,
      eventsToMove: context.eventsToMove,
      mitEvents: [moving, blocker],
    }),
    false,
  );
});

test('canDropExistingMitigations 会阻止多选移动破坏未选中的充能技能排布', () => {
  const a = createMitEvent('drk-oblation', 0, 'DRK', 1);
  const b = createMitEvent('drk-oblation', 30_000, 'DRK', 1);
  const staticMit = createMitEvent('drk-oblation', 100_000, 'DRK', 1);
  const context = prepareExistingMitDrag(a, [a.id, b.id], [a, b, staticMit]);

  assert.equal(
    canDropExistingMitigations({
      sourceMit: a,
      tStartMs: 50_000,
      eventsToMove: context.eventsToMove,
      mitEvents: [a, b, staticMit],
    }),
    false,
  );

  assert.equal(
    buildMovedMitEvents({
      sourceMit: a,
      tStartMs: 50_000,
      eventsToMove: context.eventsToMove,
      mitEvents: [a, b, staticMit],
    }),
    null,
  );
});
