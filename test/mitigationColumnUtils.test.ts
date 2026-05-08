import test from 'node:test';
import assert from 'node:assert/strict';

import { SKILLS } from '../src/data/skills';
import type { CooldownEvent, MitEvent } from '../src/model/types';
import {
  getCooldownColumnKey,
  getMitColumnKey,
} from '../src/components/Timeline/mitigationColumnUtils';
import { buildTimelineLayout } from '../src/components/Timeline/timelineLayout';

const partyLayout = buildTimelineLayout({
  members: [
    { playerId: 1, name: 'Paladin', job: 'PLD', collapsed: false },
    { playerId: 2, name: 'Warrior', job: 'WAR', collapsed: false },
  ],
  skills: SKILLS,
});

test('减伤事件的 role 技能列会按 ownerId 分发', () => {
  const pldReprisal: Pick<MitEvent, 'skillId' | 'ownerJob' | 'ownerId'> = {
    skillId: 'role-reprisal@PLD',
    ownerJob: 'PLD',
    ownerId: 1,
  };
  const warReprisal: Pick<MitEvent, 'skillId' | 'ownerJob' | 'ownerId'> = {
    skillId: 'role-reprisal@WAR',
    ownerJob: 'WAR',
    ownerId: 2,
  };

  assert.equal(getMitColumnKey(pldReprisal, partyLayout), 'role-reprisal:1');
  assert.equal(getMitColumnKey(warReprisal, partyLayout), 'role-reprisal:2');
});

test('冷却事件的 role 技能列会按 ownerKey 分发', () => {
  const pldRampartCooldown: Pick<CooldownEvent, 'skillId' | 'ownerJob' | 'ownerKey'> = {
    skillId: 'role-rampart',
    ownerJob: 'PLD',
    ownerKey: 'id:1',
  };
  const warRampartCooldown: Pick<CooldownEvent, 'skillId' | 'ownerJob' | 'ownerKey'> = {
    skillId: 'role-rampart',
    ownerJob: 'WAR',
    ownerKey: 'id:2',
  };

  assert.equal(getCooldownColumnKey(pldRampartCooldown, partyLayout), 'role-rampart:1');
  assert.equal(getCooldownColumnKey(warRampartCooldown, partyLayout), 'role-rampart:2');
});

test('非 role 技能也会按 ownerId 分发', () => {
  const utilityMit: Pick<MitEvent, 'skillId' | 'ownerJob' | 'ownerId'> = {
    skillId: 'pld-h-sheltron',
    ownerJob: 'PLD',
    ownerId: 1,
  };
  const utilityCooldown: Pick<CooldownEvent, 'skillId' | 'ownerJob' | 'ownerKey'> = {
    skillId: 'pld-h-sheltron',
    ownerJob: 'PLD',
    ownerKey: 'id:1',
  };

  assert.equal(getMitColumnKey(utilityMit, partyLayout), 'pld-h-sheltron:1');
  assert.equal(getCooldownColumnKey(utilityCooldown, partyLayout), 'pld-h-sheltron:1');
});
