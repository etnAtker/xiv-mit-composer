import test from 'node:test';
import assert from 'node:assert/strict';

import type { Skill } from '../src/model/types';
import { SKILLS, withOwnerSkillId } from '../src/data/skills';
import { buildMitEvents } from '../src/domain/fflogs/buildMitEvents';

const SKILL_BY_ACTION_ID = new Map(SKILLS.map((skill) => [skill.actionId, skill]));

test('小宇宙会合并为大宇宙的结束标记', () => {
  const events = buildMitEvents(
    [
      {
        ownerJob: 'AST',
        ownerId: 100,
        casts: [
          { time: 10, actionId: 25874 },
          { time: 18, actionId: 25875 },
        ],
      },
    ],
    (actionId) => SKILL_BY_ACTION_ID.get(actionId),
    withOwnerSkillId,
  );

  assert.equal(events.length, 1);
  assert.equal(events[0].skillId, 'ast-macrocosmos');
  assert.equal(events[0].tStartMs, 10_000);
  assert.equal(events[0].tEndMs, 18_000);
  assert.equal(events[0].durationMs, 8_000);
  assert.deepEqual(events[0].endedBy, {
    skillId: 'ast-microcosmos',
    tMs: 18_000,
  });
});

test('允许 self recast 的技能首次释放不会被持续结束逻辑吞掉', () => {
  const selfRecastSkill: Skill = {
    id: 'test-self-recast',
    name: '自结束技能',
    name_jp: '自结束技能',
    name_en: 'Self Recast',
    name_fr: 'Self Recast',
    name_de: 'Self Recast',
    cooldownSec: 30,
    durationSec: 10,
    job: 'AST',
    actionId: 900001,
    durationEnd: {
      allowSelfRecast: true,
    },
  };

  const events = buildMitEvents(
    [
      {
        ownerJob: 'AST',
        ownerId: 100,
        casts: [{ time: 10, actionId: selfRecastSkill.actionId }],
      },
    ],
    (actionId) => (actionId === selfRecastSkill.actionId ? selfRecastSkill : undefined),
    withOwnerSkillId,
  );

  assert.equal(events.length, 1);
  assert.equal(events[0].skillId, selfRecastSkill.id);
  assert.equal(events[0].tStartMs, 10_000);
  assert.equal(events[0].tEndMs, 20_000);
  assert.equal(events[0].endedBy, undefined);
});

test('允许 self recast 的技能再次释放会结束前一个持续', () => {
  const selfRecastSkill: Skill = {
    id: 'test-self-recast',
    name: '自结束技能',
    name_jp: '自结束技能',
    name_en: 'Self Recast',
    name_fr: 'Self Recast',
    name_de: 'Self Recast',
    cooldownSec: 30,
    durationSec: 10,
    job: 'AST',
    actionId: 900001,
    durationEnd: {
      allowSelfRecast: true,
    },
  };

  const events = buildMitEvents(
    [
      {
        ownerJob: 'AST',
        ownerId: 100,
        casts: [
          { time: 10, actionId: selfRecastSkill.actionId },
          { time: 18, actionId: selfRecastSkill.actionId },
        ],
      },
    ],
    (actionId) => (actionId === selfRecastSkill.actionId ? selfRecastSkill : undefined),
    withOwnerSkillId,
  );

  assert.equal(events.length, 1);
  assert.equal(events[0].skillId, selfRecastSkill.id);
  assert.equal(events[0].tStartMs, 10_000);
  assert.equal(events[0].tEndMs, 18_000);
  assert.deepEqual(events[0].endedBy, {
    skillId: selfRecastSkill.id,
    tMs: 18_000,
  });
});
