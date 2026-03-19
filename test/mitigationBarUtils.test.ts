import test from 'node:test';
import assert from 'node:assert/strict';

import type { CooldownEvent, MitEvent } from '../src/model/types';
import { getMitigationBarHeights } from '../src/components/Timeline/mitigationBarUtils';

function createMitEvent(
  skillId: string,
  tStartMs: number,
  durationMs: number,
  ownerJob?: MitEvent['ownerJob'],
  ownerId?: number,
): MitEvent {
  return {
    eventType: 'mit',
    id: `${skillId}-${tStartMs}`,
    skillId,
    tStartMs,
    durationMs,
    tEndMs: tStartMs + durationMs,
    ownerJob,
    ownerId,
  };
}

function createCooldownEvent(
  skillId: string,
  tStartMs: number,
  tEndMs: number,
  ownerJob?: CooldownEvent['ownerJob'],
  ownerKey?: string,
): CooldownEvent {
  return {
    eventType: 'cooldown',
    cdType: 'cooldown',
    skillId,
    ownerJob,
    ownerKey,
    tStartMs,
    tEndMs,
    durationMs: tEndMs - tStartMs,
  };
}

test('条内 CD 高度来自 cooldownEvents 而不是技能静态 CD', () => {
  const mit = createMitEvent('role-rampart@PLD', 10_000, 20_000, 'PLD', 1);
  const cooldownEvents = [createCooldownEvent('role-rampart', 10_000, 100_000, 'PLD', 'id:1')];

  const heights = getMitigationBarHeights(mit, 5, cooldownEvents);

  assert.equal(heights.effectHeight, 60);
  assert.equal(heights.cooldownHeight, 350);
  assert.equal(heights.totalHeight, 450);
});

test('短于效果时长的实际 CD 不会渲染尾巴', () => {
  const mit = createMitEvent('drk-oblation', 10_000, 10_000, 'DRK', 1);
  const cooldownEvents = [createCooldownEvent('drk-oblation', 10_000, 10_500, 'DRK', 'id:1')];

  const heights = getMitigationBarHeights(mit, 5, cooldownEvents);

  assert.equal(heights.cooldownHeight, 0);
});

test('owner 不匹配的 cooldownEvent 不会污染当前条身', () => {
  const mit = createMitEvent('role-reprisal@PLD', 10_000, 15_000, 'PLD', 1);
  const cooldownEvents = [createCooldownEvent('role-reprisal', 10_000, 70_000, 'WAR', 'id:2')];

  const heights = getMitigationBarHeights(mit, 5, cooldownEvents);

  assert.equal(heights.cooldownHeight, 0);
});
