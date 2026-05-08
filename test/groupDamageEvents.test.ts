import test from 'node:test';
import assert from 'node:assert/strict';

import { groupDamageEvents } from '../src/domain/fflogs/groupDamageEvents';
import type { DamageEvent, PartyMember } from '../src/model/types';

const members: PartyMember[] = [
  { playerId: 1, name: 'Alpha', job: 'GNB', collapsed: false },
  { playerId: 2, name: 'Bravo', job: 'WHM', collapsed: false },
];

function createDamage(playerId: number, guid: number, tMs: number, amount: number): DamageEvent {
  return {
    timestamp: tMs,
    type: 'damage-combined',
    sourceID: 100,
    targetID: playerId,
    ability: { guid, name: `Ability ${guid}`, type: 1 },
    amount,
    unmitigatedAmount: amount,
    tMs,
  };
}

test('同 ability 且 100ms 内的多人伤害会合并', () => {
  const groups = groupDamageEvents(
    {
      1: [createDamage(1, 1000, 10_000, 100)],
      2: [createDamage(2, 1000, 10_050, 200)],
    },
    members,
  );

  assert.equal(groups.length, 1);
  assert.equal(groups[0].tMs, 10_000);
  assert.equal(groups[0].displayAmount, 200);
  assert.deepEqual(
    groups[0].hits.map((hit) => hit.playerId),
    [1, 2],
  );
});

test('显示伤害取最大值时会把 NaN 当作最小值', () => {
  const groups = groupDamageEvents(
    {
      1: [createDamage(1, 1000, 10_000, Number.NaN)],
      2: [createDamage(2, 1000, 10_050, 100)],
    },
    members,
  );

  assert.equal(groups.length, 1);
  assert.equal(groups[0].displayAmount, 100);
});

test('显示伤害全为 NaN 时保留未知值', () => {
  const groups = groupDamageEvents(
    {
      1: [createDamage(1, 1000, 10_000, Number.NaN)],
      2: [createDamage(2, 1000, 10_050, Number.NaN)],
    },
    members,
  );

  assert.equal(groups.length, 1);
  assert.equal(Number.isNaN(groups[0].displayAmount), true);
});

test('不同 ability 不合并', () => {
  const groups = groupDamageEvents(
    {
      1: [createDamage(1, 1000, 10_000, 100)],
      2: [createDamage(2, 2000, 10_050, 200)],
    },
    members,
  );

  assert.equal(groups.length, 2);
});

test('同 ability 但超过窗口不合并', () => {
  const groups = groupDamageEvents(
    {
      1: [createDamage(1, 1000, 10_000, 100)],
      2: [createDamage(2, 1000, 10_100, 200)],
    },
    members,
  );

  assert.equal(groups.length, 2);
});
