import test from 'node:test';
import assert from 'node:assert/strict';

import type { MitEvent } from '../src/model/types';
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

test('条身高度只由持续时间决定', () => {
  const mit = createMitEvent('role-rampart@PLD', 10_000, 20_000, 'PLD', 1);

  const heights = getMitigationBarHeights(mit, 5);

  assert.equal(heights.effectHeight, 60);
  assert.equal(heights.totalHeight, 100);
});

test('短持续时间条身仍保持 header + effect 结构', () => {
  const mit = createMitEvent('drk-oblation', 10_000, 10_000, 'DRK', 1);

  const heights = getMitigationBarHeights(mit, 5);

  assert.equal(heights.effectHeight, 10);
  assert.equal(heights.totalHeight, 50);
});
