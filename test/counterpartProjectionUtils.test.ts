import test from 'node:test';
import assert from 'node:assert/strict';

import { SKILLS } from '../src/data/skills';
import type { Job, MitEvent } from '../src/model/types';
import {
  buildCounterpartProjectionGhosts,
  shouldProjectCounterpart,
} from '../src/components/Timeline/counterpartProjectionUtils';
import { buildTimelineLayout } from '../src/components/Timeline/timelineLayout';

function createMitEvent(skillId: string, ownerJob: Job, ownerId: number): MitEvent {
  return {
    eventType: 'mit',
    id: `${skillId}-${ownerId}`,
    skillId,
    tStartMs: 10_000,
    durationMs: 15_000,
    tEndMs: 25_000,
    ownerJob,
    ownerId,
  };
}

test('对位投影由技能字段显式控制', () => {
  assert.equal(shouldProjectCounterpart('role-reprisal@PLD'), true);
  assert.equal(shouldProjectCounterpart('role-feint@MNK'), true);
  assert.equal(shouldProjectCounterpart('role-addle@BLM'), true);
  assert.equal(shouldProjectCounterpart('role-rampart@PLD'), false);
});

test('共通职能技能只向其他成员的同技能列生成投影', () => {
  const layout = buildTimelineLayout({
    members: [
      { playerId: 1, name: 'Monk', job: 'MNK', collapsed: false },
      { playerId: 2, name: 'Samurai', job: 'SAM', collapsed: false },
      { playerId: 3, name: 'Black Mage', job: 'BLM', collapsed: false },
    ],
    skills: SKILLS,
  });

  const ghosts = buildCounterpartProjectionGhosts(
    [createMitEvent('role-feint@MNK', 'MNK', 1)],
    layout.memberGroups,
  );

  assert.deepEqual(
    ghosts.map((ghost) => ({ skillId: ghost.mit.skillId, targetOwnerId: ghost.targetOwnerId })),
    [{ skillId: 'role-feint@MNK', targetOwnerId: 2 }],
  );
});

test('未开启字段的共通技能不会生成对位投影', () => {
  const layout = buildTimelineLayout({
    members: [
      { playerId: 1, name: 'Paladin', job: 'PLD', collapsed: false },
      { playerId: 2, name: 'Warrior', job: 'WAR', collapsed: false },
    ],
    skills: SKILLS,
  });

  const ghosts = buildCounterpartProjectionGhosts(
    [createMitEvent('role-rampart@PLD', 'PLD', 1)],
    layout.memberGroups,
  );

  assert.equal(ghosts.length, 0);
});
