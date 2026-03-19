import test from 'node:test';
import assert from 'node:assert/strict';

import type { Job, MitEvent } from '../src/model/types';
import { canInsertMitigation, tryBuildCooldowns } from '../src/utils/playerCast';

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

function simplifyCooldowns(events: MitEvent[]) {
  return (tryBuildCooldowns(events) ?? []).map((event) => ({
    cdType: event.cdType,
    skillId: event.skillId,
    ownerJob: event.ownerJob,
    ownerKey: event.ownerKey,
    tStartMs: event.tStartMs,
    tEndMs: event.tEndMs,
  }));
}

test('单次释放会生成前向 unusable 区间，并保留 ownerJob', () => {
  const cooldowns = simplifyCooldowns([createMitEvent('role-rampart', 10_000, 'PLD')]);

  assert.deepEqual(cooldowns, [
    {
      cdType: 'unusable',
      skillId: 'role-rampart',
      ownerJob: 'PLD',
      ownerKey: 'id:1',
      tStartMs: -80_000,
      tEndMs: 10_000,
    },
    {
      cdType: 'cooldown',
      skillId: 'role-rampart',
      ownerJob: 'PLD',
      ownerKey: 'id:1',
      tStartMs: 10_000,
      tEndMs: 100_000,
    },
  ]);
});

test('共享 CD 组会把限制传播到同组技能', () => {
  const events = [createMitEvent('war-bloodwhetting', 10_000, 'WAR')];
  const cooldowns = tryBuildCooldowns(events) ?? [];

  assert.equal(
    canInsertMitigation('war-nascent-flash', 20_000, events, 'WAR', 1, undefined, cooldowns),
    false,
  );
  assert.equal(
    canInsertMitigation('war-nascent-flash', 36_000, events, 'WAR', 1, undefined, cooldowns),
    true,
  );

  const siblingCooldowns = cooldowns
    .filter((event) => event.skillId === 'war-nascent-flash')
    .map((event) => ({
      cdType: event.cdType,
      tStartMs: event.tStartMs,
      tEndMs: event.tEndMs,
    }));

  assert.deepEqual(siblingCooldowns, [
    {
      cdType: 'unusable',
      tStartMs: -15_000,
      tEndMs: 10_000,
    },
    {
      cdType: 'cooldown',
      tStartMs: 10_000,
      tEndMs: 35_000,
    },
  ]);
});

test('充能技能会按可用层数顺序恢复', () => {
  const events = [
    createMitEvent('drk-oblation', 10_000, 'DRK'),
    createMitEvent('drk-oblation', 20_000, 'DRK'),
  ];
  const cooldowns = tryBuildCooldowns(events) ?? [];

  assert.equal(
    canInsertMitigation('drk-oblation', 50_000, events, 'DRK', 1, undefined, cooldowns),
    false,
  );
  assert.equal(
    canInsertMitigation('drk-oblation', 75_000, events, 'DRK', 1, undefined, cooldowns),
    true,
  );

  const selfCooldowns = cooldowns
    .filter((event) => event.skillId === 'drk-oblation')
    .map((event) => ({
      cdType: event.cdType,
      tStartMs: event.tStartMs,
      tEndMs: event.tEndMs,
    }));

  assert.deepEqual(selfCooldowns, [
    {
      cdType: 'unusable',
      tStartMs: -40_000,
      tEndMs: 10_000,
    },
    {
      cdType: 'cooldown',
      tStartMs: 10_000,
      tEndMs: 10_500,
    },
    {
      cdType: 'unusable',
      tStartMs: 10_500,
      tEndMs: 20_000,
    },
    {
      cdType: 'cooldown',
      tStartMs: 20_000,
      tEndMs: 70_000,
    },
  ]);
});

test('同技能不同 owner 不会互相阻塞', () => {
  const events = [createMitEvent('role-rampart', 10_000, 'PLD', 1)];
  const cooldowns = tryBuildCooldowns(events) ?? [];

  assert.equal(
    canInsertMitigation('role-rampart', 20_000, events, 'PLD', 1, undefined, cooldowns),
    false,
  );
  assert.equal(
    canInsertMitigation('role-rampart', 20_000, events, 'WAR', 2, undefined, cooldowns),
    true,
  );
});
