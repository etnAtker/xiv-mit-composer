import test from 'node:test';
import assert from 'node:assert/strict';

import type { CooldownGroup, Job, MitEvent, Skill } from '../src/model/types';
import { COOLDOWN_GROUP_MAP, COOLDOWN_GROUP_SKILLS_MAP, SKILL_MAP } from '../src/data/skills';
import {
  buildCooldownsStrict,
  buildCooldownsTolerant,
  buildPlayerCastStateTolerant,
  canInsertMitigation,
  evaluateMitigationSetStrict,
  tryBuildCooldowns,
} from '../src/utils/playerCast';

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

function createTestSkill(skill: Partial<Skill> & Pick<Skill, 'id'>): Skill {
  return {
    id: skill.id,
    name: skill.id,
    name_jp: skill.id,
    name_en: skill.id,
    name_fr: skill.id,
    name_de: skill.id,
    cooldownSec: 0.5,
    durationSec: 1,
    job: 'PLD',
    actionId: 1,
    ...skill,
  };
}

function withTestCooldownGroup(group: CooldownGroup, skills: Skill[], run: () => void) {
  withTestCooldownGroups([group], skills, run);
}

function withTestCooldownGroups(groups: CooldownGroup[], skills: Skill[], run: () => void) {
  const oldGroups = groups.map((group) => COOLDOWN_GROUP_MAP.get(group.id));
  const oldSkills = skills.map((skill) => SKILL_MAP.get(skill.id));
  const oldGroupSkills = groups.map((group) => COOLDOWN_GROUP_SKILLS_MAP.get(group.id));

  for (const group of groups) {
    COOLDOWN_GROUP_MAP.set(group.id, group);
  }
  for (const skill of skills) {
    SKILL_MAP.set(skill.id, skill);
  }
  for (const group of groups) {
    COOLDOWN_GROUP_SKILLS_MAP.set(
      group.id,
      skills.filter((skill) =>
        Array.isArray(skill.cooldownGroup)
          ? skill.cooldownGroup.includes(group.id)
          : skill.cooldownGroup === group.id,
      ),
    );
  }

  try {
    run();
  } finally {
    for (const [index, group] of groups.entries()) {
      const oldGroup = oldGroups[index];
      if (oldGroup) {
        COOLDOWN_GROUP_MAP.set(group.id, oldGroup);
      } else {
        COOLDOWN_GROUP_MAP.delete(group.id);
      }
    }

    for (const [index, skill] of skills.entries()) {
      const oldSkill = oldSkills[index];
      if (oldSkill) {
        SKILL_MAP.set(skill.id, oldSkill);
      } else {
        SKILL_MAP.delete(skill.id);
      }
    }

    for (const [index, group] of groups.entries()) {
      const oldSkillsForGroup = oldGroupSkills[index];
      if (oldSkillsForGroup) {
        COOLDOWN_GROUP_SKILLS_MAP.set(group.id, oldSkillsForGroup);
      } else {
        COOLDOWN_GROUP_SKILLS_MAP.delete(group.id);
      }
    }
  }
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

test('显示资源组会保留共享层数变化区间', () => {
  const events = [
    createMitEvent('pld-h-sheltron', 10_000, 'PLD'),
    createMitEvent('pld-intervention', 20_000, 'PLD'),
  ];
  const state = buildPlayerCastStateTolerant(events);

  assert.deepEqual(
    state.resourceEvents.map((event) => ({
      resourceGroupId: event.resourceGroupId,
      ownerKey: event.ownerKey,
      value: event.value,
      maxValue: event.maxValue,
      tStartMs: event.tStartMs,
      tEndMs: event.tEndMs,
    })),
    [
      {
        resourceGroupId: 'pld-grp-sheltron',
        ownerKey: 'id:1',
        value: 2,
        maxValue: 2,
        tStartMs: 0,
        tEndMs: 10_000,
      },
      {
        resourceGroupId: 'pld-grp-sheltron',
        ownerKey: 'id:1',
        value: 1,
        maxValue: 2,
        tStartMs: 10_000,
        tEndMs: 20_000,
      },
      {
        resourceGroupId: 'pld-grp-sheltron',
        ownerKey: 'id:1',
        value: 0,
        maxValue: 2,
        tStartMs: 20_000,
        tEndMs: 32_600,
      },
      {
        resourceGroupId: 'pld-grp-sheltron',
        ownerKey: 'id:1',
        value: 1,
        maxValue: 2,
        tStartMs: 32_600,
        tEndMs: 55_200,
      },
      {
        resourceGroupId: 'pld-grp-sheltron',
        ownerKey: 'id:1',
        value: 2,
        maxValue: 2,
        tStartMs: 55_200,
        tEndMs: 55_200,
      },
    ],
  );
});

test('资源组未配置自动恢复时，消耗后只会被技能恢复', () => {
  const group: CooldownGroup = {
    id: 'test-grp-manual-recovery',
    stack: 1,
  };
  const consumeSkill = createTestSkill({
    id: 'test-manual-consume',
    cooldownGroup: group.id,
  });
  const recoverSkill = createTestSkill({
    id: 'test-manual-recover',
    cooldownGroupRecoveries: [{ groupId: group.id }],
  });

  withTestCooldownGroup(group, [consumeSkill, recoverSkill], () => {
    const consumedOnly = [createMitEvent(consumeSkill.id, 10_000, 'PLD')];
    const consumedOnlyCooldowns = tryBuildCooldowns(consumedOnly) ?? [];

    assert.equal(
      consumedOnlyCooldowns.find(
        (event) =>
          event.skillId === consumeSkill.id &&
          event.cdType === 'cooldown' &&
          event.tStartMs === 10_000,
      )?.tEndMs,
      Number.MAX_SAFE_INTEGER,
    );
    assert.equal(
      canInsertMitigation(
        consumeSkill.id,
        20_000,
        consumedOnly,
        'PLD',
        1,
        undefined,
        consumedOnlyCooldowns,
      ),
      false,
    );

    const recovered = [
      createMitEvent(consumeSkill.id, 10_000, 'PLD'),
      createMitEvent(recoverSkill.id, 30_000, 'PLD'),
    ];
    const recoveredCooldowns = tryBuildCooldowns(recovered) ?? [];

    assert.equal(
      recoveredCooldowns.find(
        (event) =>
          event.skillId === consumeSkill.id &&
          event.cdType === 'cooldown' &&
          event.tStartMs === 10_000,
      )?.tEndMs,
      30_000,
    );
    assert.equal(
      canInsertMitigation(
        consumeSkill.id,
        35_000,
        recovered,
        'PLD',
        1,
        undefined,
        recoveredCooldowns,
      ),
      true,
    );
  });
});

test('技能恢复资源组达到上限时不会继续增加层数', () => {
  const group: CooldownGroup = {
    id: 'test-grp-recovery-cap',
    stack: 1,
    resourceDisplay: { label: '测' },
  };
  const consumeSkill = createTestSkill({
    id: 'test-cap-consume',
    cooldownGroup: group.id,
  });
  const recoverSkill = createTestSkill({
    id: 'test-cap-recover',
    cooldownGroupRecoveries: [{ groupId: group.id }],
  });

  withTestCooldownGroup(group, [consumeSkill, recoverSkill], () => {
    const state = buildPlayerCastStateTolerant([createMitEvent(recoverSkill.id, 10_000, 'PLD')]);

    assert.deepEqual(state.resourceEvents, []);
  });
});

test('资源组可配置初始层数，并从战斗开始自动恢复', () => {
  const group: CooldownGroup = {
    id: 'test-grp-initial-stack',
    stack: 1,
    initialStack: 0,
    recovery: { cooldownSec: 30 },
    resourceDisplay: { label: '初' },
  };
  const consumeSkill = createTestSkill({
    id: 'test-initial-consume',
    cooldownGroup: group.id,
  });

  withTestCooldownGroup(group, [consumeSkill], () => {
    const state = buildPlayerCastStateTolerant([createMitEvent(consumeSkill.id, 40_000, 'PLD')]);
    const cooldowns = state.cooldownEvents
      .filter((event) => event.skillId === consumeSkill.id)
      .map((event) => ({
        cdType: event.cdType,
        tStartMs: event.tStartMs,
        tEndMs: event.tEndMs,
      }));

    assert.deepEqual(cooldowns, [
      {
        cdType: 'cooldown',
        tStartMs: 0,
        tEndMs: 30_000,
      },
      {
        cdType: 'unusable',
        tStartMs: 30_000,
        tEndMs: 40_000,
      },
      {
        cdType: 'cooldown',
        tStartMs: 40_000,
        tEndMs: 70_000,
      },
    ]);
    assert.deepEqual(
      state.resourceEvents.map((event) => ({
        value: event.value,
        maxValue: event.maxValue,
        tStartMs: event.tStartMs,
        tEndMs: event.tEndMs,
      })),
      [
        { value: 0, maxValue: 1, tStartMs: 0, tEndMs: 30_000 },
        { value: 1, maxValue: 1, tStartMs: 30_000, tEndMs: 40_000 },
        { value: 0, maxValue: 1, tStartMs: 40_000, tEndMs: 70_000 },
        { value: 1, maxValue: 1, tStartMs: 70_000, tEndMs: 70_000 },
      ],
    );
  });
});

test('数组 cooldownGroup 会按顺序消耗第一个可用资源', () => {
  const events = [
    createMitEvent('sch-recitation', 0, 'SCH', 1, 15_000),
    createMitEvent('sch-indomitability', 10_000, 'SCH'),
    createMitEvent('sch-excogitation', 20_000, 'SCH'),
    createMitEvent('sch-lustrate', 30_000, 'SCH'),
    createMitEvent('sch-energy-drain', 40_000, 'SCH'),
  ];

  const result = evaluateMitigationSetStrict(events);

  assert.equal(result.ok, true);
});

test('GCD 技能会消耗秘策资源，使后续以太超流技能不能再免费', () => {
  const events = [
    createMitEvent('sch-recitation', 0, 'SCH', 1, 15_000),
    createMitEvent('sch-adloquium', 10_000, 'SCH'),
    createMitEvent('sch-indomitability', 20_000, 'SCH'),
    createMitEvent('sch-excogitation', 30_000, 'SCH'),
    createMitEvent('sch-lustrate', 40_000, 'SCH'),
    createMitEvent('sch-energy-drain', 50_000, 'SCH'),
  ];

  const result = evaluateMitigationSetStrict(events);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'NEGATIVE_STACK');
  }
});

test('秘策资源会在技能结束时过期', () => {
  const events = [
    createMitEvent('sch-recitation', 0, 'SCH', 1, 15_000),
    createMitEvent('sch-indomitability', 16_000, 'SCH'),
    createMitEvent('sch-excogitation', 30_000, 'SCH'),
    createMitEvent('sch-lustrate', 40_000, 'SCH'),
    createMitEvent('sch-energy-drain', 50_000, 'SCH'),
  ];

  const result = evaluateMitigationSetStrict(events);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'NEGATIVE_STACK');
  }
});

test('数组 cooldownGroup 的 UI 冷却只在所有资源都不可用时生效', () => {
  const events = [
    createMitEvent('sch-lustrate', 0, 'SCH'),
    createMitEvent('sch-energy-drain', 1_000, 'SCH'),
    createMitEvent('sch-sacred-soil', 2_000, 'SCH'),
    createMitEvent('sch-recitation', 10_000, 'SCH', 1, 15_000),
  ];
  const result = evaluateMitigationSetStrict(events);

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error('期望以太超流耗尽后仍能生成合法状态');
  }

  assert.equal(
    canInsertMitigation(
      'sch-indomitability',
      11_000,
      result.mitEvents,
      'SCH',
      1,
      undefined,
      result.cooldownEvents,
    ),
    true,
  );
  assert.equal(
    canInsertMitigation(
      'sch-indomitability',
      26_000,
      result.mitEvents,
      'SCH',
      1,
      undefined,
      result.cooldownEvents,
    ),
    false,
  );
});

test('数组 cooldownGroup 的 UI 冷却按每段实际选中资源判断', () => {
  const primaryGroup: CooldownGroup = {
    id: 'test-grp-primary-priority',
    stack: 1,
    recovery: { cooldownSec: 10 },
  };
  const secondaryGroup: CooldownGroup = {
    id: 'test-grp-secondary-priority',
    stack: 1,
  };
  const primaryConsumeSkill = createTestSkill({
    id: 'test-primary-consume',
    cooldownGroup: primaryGroup.id,
  });
  const multiGroupSkill = createTestSkill({
    id: 'test-priority-multi',
    cooldownGroup: [primaryGroup.id, secondaryGroup.id],
  });

  withTestCooldownGroups(
    [primaryGroup, secondaryGroup],
    [primaryConsumeSkill, multiGroupSkill],
    () => {
      const events = [createMitEvent(primaryConsumeSkill.id, 10_000, 'PLD')];
      const cooldowns = tryBuildCooldowns(events) ?? [];

      assert.equal(
        canInsertMitigation(multiGroupSkill.id, 5_000, events, 'PLD', 1, undefined, cooldowns),
        false,
      );
      assert.equal(
        canInsertMitigation(multiGroupSkill.id, 15_000, events, 'PLD', 1, undefined, cooldowns),
        true,
      );
    },
  );
});

test('无自动恢复资源组耗尽前会把最后一层预占为不可用', () => {
  const events = [
    createMitEvent('sch-energy-drain', 5_000, 'SCH'),
    createMitEvent('sch-energy-drain', 8_000, 'SCH'),
    createMitEvent('sch-energy-drain', 11_000, 'SCH'),
    createMitEvent('sch-aetherflow', 15_000, 'SCH'),
  ];
  const result = evaluateMitigationSetStrict(events);

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error('期望 SCH 以太超流资源事件合法');
  }

  for (const skillId of ['sch-energy-drain', 'sch-sacred-soil', 'sch-lustrate']) {
    assert.equal(
      canInsertMitigation(
        skillId,
        9_000,
        result.mitEvents,
        'SCH',
        1,
        undefined,
        result.cooldownEvents,
      ),
      false,
      `${skillId} 应在 8s-11s 因最后一层以太超流已被预占而不可用`,
    );
  }

  assert.equal(
    canInsertMitigation(
      'sch-indomitability',
      9_000,
      result.mitEvents,
      'SCH',
      1,
      undefined,
      result.cooldownEvents,
    ),
    false,
  );
  assert.equal(
    canInsertMitigation(
      'sch-indomitability',
      12_000,
      result.mitEvents,
      'SCH',
      1,
      undefined,
      result.cooldownEvents,
    ),
    false,
  );
  assert.equal(
    canInsertMitigation(
      'sch-indomitability',
      16_000,
      result.mitEvents,
      'SCH',
      1,
      undefined,
      result.cooldownEvents,
    ),
    true,
  );
});

test('资源预占会按未来技能的替代资源判断候选技能是否不可用', () => {
  const groupA: CooldownGroup = { id: 'test-grp-option-a', stack: 1 };
  const groupB: CooldownGroup = { id: 'test-grp-option-b', stack: 1 };
  const groupC: CooldownGroup = { id: 'test-grp-option-c', stack: 1, initialStack: 0 };
  const skillA = createTestSkill({
    id: 'test-option-skill-a',
    cooldownGroup: [groupA.id, groupB.id],
  });
  const skillB = createTestSkill({
    id: 'test-option-skill-b',
    cooldownGroup: [groupA.id, groupC.id],
  });

  withTestCooldownGroups([groupA, groupB, groupC], [skillA, skillB], () => {
    const futureAEvents = [createMitEvent(skillA.id, 5_000, 'PLD')];
    const futureACooldowns = tryBuildCooldowns(futureAEvents) ?? [];

    assert.equal(
      canInsertMitigation(skillA.id, 1_000, futureAEvents, 'PLD', 1, undefined, futureACooldowns),
      true,
    );
    assert.equal(
      canInsertMitigation(skillB.id, 1_000, futureAEvents, 'PLD', 1, undefined, futureACooldowns),
      true,
    );

    const futureBEvents = [createMitEvent(skillB.id, 5_000, 'PLD')];
    const futureBCooldowns = tryBuildCooldowns(futureBEvents) ?? [];

    assert.equal(
      canInsertMitigation(skillA.id, 1_000, futureBEvents, 'PLD', 1, undefined, futureBCooldowns),
      false,
    );
    assert.equal(
      canInsertMitigation(skillB.id, 1_000, futureBEvents, 'PLD', 1, undefined, futureBCooldowns),
      false,
    );
  });
});

test('GCD 技能消耗秘策后，数组 cooldownGroup 会重新受以太超流耗尽限制', () => {
  const events = [
    createMitEvent('sch-lustrate', 0, 'SCH'),
    createMitEvent('sch-energy-drain', 1_000, 'SCH'),
    createMitEvent('sch-sacred-soil', 2_000, 'SCH'),
    createMitEvent('sch-recitation', 10_000, 'SCH', 1, 15_000),
    createMitEvent('sch-adloquium', 11_000, 'SCH'),
  ];
  const result = evaluateMitigationSetStrict(events);

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error('期望鼓舞消耗秘策资源后仍能生成合法状态');
  }

  assert.equal(
    canInsertMitigation(
      'sch-indomitability',
      12_000,
      result.mitEvents,
      'SCH',
      1,
      undefined,
      result.cooldownEvents,
    ),
    false,
  );
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

test('strict 模式会拒绝非法的单资源重复占用', () => {
  const invalidEvents = [
    createMitEvent('role-rampart', 10_000, 'PLD', 1),
    createMitEvent('role-rampart', 20_000, 'PLD', 1),
  ];

  const strictResult = buildCooldownsStrict(invalidEvents);
  assert.equal(strictResult.ok, false);

  const tolerantCooldowns = buildCooldownsTolerant(invalidEvents);
  assert.ok(tolerantCooldowns.length > 0);
});

test('evaluateMitigationSetStrict 会返回排序后的事件与 cooldowns', () => {
  const later = createMitEvent('role-reprisal@PLD', 30_000, 'PLD', 1);
  const earlier = createMitEvent('role-rampart', 10_000, 'PLD', 1);

  const result = evaluateMitigationSetStrict([later, earlier]);

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error('期望得到合法的减伤状态');
  }

  assert.deepEqual(
    result.mitEvents.map((mit) => mit.id),
    [earlier.id, later.id],
  );
  assert.ok(result.cooldownEvents.length > 0);
});

test('canInsertMitigation 在 strict 兜底构建失败时会直接拒绝', () => {
  const invalidEvents = [
    createMitEvent('role-rampart', 10_000, 'PLD', 1),
    createMitEvent('role-rampart', 20_000, 'PLD', 1),
  ];

  assert.equal(
    canInsertMitigation('role-rampart', 150_000, invalidEvents, 'PLD', 1, new Set()),
    false,
  );
});
