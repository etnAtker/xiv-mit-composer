import test from 'node:test';
import assert from 'node:assert/strict';

import { ROLE_SKILL_IDS, SKILLS } from '../src/data/skills';
import type { CooldownEvent, MitEvent } from '../src/model/types';
import {
  getCooldownColumnKey,
  getMitColumnKey,
} from '../src/components/Timeline/mitigationColumnUtils';
import { buildTimelineLayout } from '../src/components/Timeline/timelineLayout';

const dualTankLayout = buildTimelineLayout({
  jobs: ['PLD', 'WAR'],
  skills: SKILLS,
  roleSkillIds: ROLE_SKILL_IDS,
});

test('减伤事件的 role 技能列会按 ownerJob 分发', () => {
  const pldReprisal: Pick<MitEvent, 'skillId' | 'ownerJob'> = {
    skillId: 'role-reprisal@PLD',
    ownerJob: 'PLD',
  };
  const warReprisal: Pick<MitEvent, 'skillId' | 'ownerJob'> = {
    skillId: 'role-reprisal@WAR',
    ownerJob: 'WAR',
  };

  assert.equal(getMitColumnKey(pldReprisal, dualTankLayout), 'role-reprisal:PLD');
  assert.equal(getMitColumnKey(warReprisal, dualTankLayout), 'role-reprisal:WAR');
});

test('冷却事件的 role 技能列会按 ownerJob 分发', () => {
  const pldRampartCooldown: Pick<CooldownEvent, 'skillId' | 'ownerJob'> = {
    skillId: 'role-rampart',
    ownerJob: 'PLD',
  };
  const warRampartCooldown: Pick<CooldownEvent, 'skillId' | 'ownerJob'> = {
    skillId: 'role-rampart',
    ownerJob: 'WAR',
  };

  assert.equal(getCooldownColumnKey(pldRampartCooldown, dualTankLayout), 'role-rampart:PLD');
  assert.equal(getCooldownColumnKey(warRampartCooldown, dualTankLayout), 'role-rampart:WAR');
});

test('非 role 技能会回退到基础列', () => {
  const utilityMit: Pick<MitEvent, 'skillId' | 'ownerJob'> = {
    skillId: 'pld-holy-sheltron',
    ownerJob: 'PLD',
  };
  const utilityCooldown: Pick<CooldownEvent, 'skillId' | 'ownerJob'> = {
    skillId: 'pld-holy-sheltron',
    ownerJob: 'PLD',
  };

  assert.equal(getMitColumnKey(utilityMit, dualTankLayout), 'pld-holy-sheltron');
  assert.equal(getCooldownColumnKey(utilityCooldown, dualTankLayout), 'pld-holy-sheltron');
});
