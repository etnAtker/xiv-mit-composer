import test from 'node:test';
import assert from 'node:assert/strict';

import type { Job, Skill } from '../src/model/types';
import { buildTimelineLayout } from '../src/components/Timeline/timelineLayout';
import {
  MIN_MEMBER_GROUP_WIDTH,
  MIT_COLUMN_WIDTH,
  MIT_MEMBER_GROUP_PADDING_X,
} from '../src/components/Timeline/timelineUtils';

function makeSkill(id: string, job: Job = 'PLD'): Skill {
  return {
    id,
    name: id,
    name_jp: id,
    name_en: id,
    name_fr: id,
    name_de: id,
    cooldownSec: 60,
    durationSec: 10,
    job,
    actionId: 1000,
  };
}

test('单技能玩家组至少占 3 个 lane 宽且 lane 居中', () => {
  const layout = buildTimelineLayout({
    members: [{ playerId: 1, name: 'Paladin', job: 'PLD', collapsed: false }],
    skills: [makeSkill('pld-one')],
  });

  assert.equal(layout.memberGroups[0].width, MIN_MEMBER_GROUP_WIDTH);
  assert.equal(layout.columnLefts[0], (MIN_MEMBER_GROUP_WIDTH - MIT_COLUMN_WIDTH) / 2);
  assert.equal(layout.mitAreaWidth, MIN_MEMBER_GROUP_WIDTH);
});

test('多技能玩家组宽度包含左右 padding', () => {
  const skillCount = 4;
  const layout = buildTimelineLayout({
    members: [{ playerId: 1, name: 'Paladin', job: 'PLD', collapsed: false }],
    skills: Array.from({ length: skillCount }, (_, index) => makeSkill(`pld-${index}`)),
  });

  const expectedWidth = skillCount * MIT_COLUMN_WIDTH + MIT_MEMBER_GROUP_PADDING_X * 2;

  assert.equal(layout.memberGroups[0].width, expectedWidth);
  assert.deepEqual(
    layout.columnLefts,
    Array.from(
      { length: skillCount },
      (_, index) => MIT_MEMBER_GROUP_PADDING_X + index * MIT_COLUMN_WIDTH,
    ),
  );
});

test('后续玩家组的技能列在该玩家组内居中', () => {
  const layout = buildTimelineLayout({
    members: [
      { playerId: 1, name: 'Paladin', job: 'PLD', collapsed: false },
      { playerId: 2, name: 'Warrior', job: 'WAR', collapsed: false },
    ],
    skills: [makeSkill('pld-one', 'PLD'), makeSkill('war-one', 'WAR')],
  });

  assert.equal(layout.memberGroups[1].left, MIN_MEMBER_GROUP_WIDTH);
  assert.equal(
    layout.columnLefts[1],
    MIN_MEMBER_GROUP_WIDTH + (MIN_MEMBER_GROUP_WIDTH - MIT_COLUMN_WIDTH) / 2,
  );
  assert.equal(layout.mitAreaWidth, MIN_MEMBER_GROUP_WIDTH * 2);
});

test('持续结束型子技能不会生成独立技能列', () => {
  const parent = makeSkill('ast-macrocosmos', 'AST');
  const child: Skill = {
    ...makeSkill('ast-microcosmos', 'AST'),
    kind: 'durationEnder',
    durationEnder: {
      parentSkillId: parent.id,
    },
  };

  const layout = buildTimelineLayout({
    members: [{ playerId: 1, name: 'Astrologian', job: 'AST', collapsed: false }],
    skills: [parent, child],
  });

  assert.deepEqual(
    layout.skillColumns.map((column) => column.id),
    [parent.id],
  );
  assert.equal(layout.columnMap[`${child.id}:1`], undefined);
});
