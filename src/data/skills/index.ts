import type { CooldownGroup, Skill } from '../../model/types';

import { AST_SKILLS } from './healer/ast';
import { HEALER_COMMON_SKILLS } from './healer/common';
import { SCH_SKILLS } from './healer/sch';
import { SGE_SKILLS } from './healer/sge';
import { WHM_SKILLS } from './healer/whm';
import { MELEE_COMMON_SKILLS } from './melee/common';
import { DRG_SKILLS } from './melee/drg';
import { MNK_SKILLS } from './melee/mnk';
import { NIN_SKILLS } from './melee/nin';
import { RPR_SKILLS } from './melee/rpr';
import { SAM_SKILLS } from './melee/sam';
import { VPR_SKILLS } from './melee/vpr';
import { BRD_SKILLS } from './ranged-physical/brd';
import { RANGED_PHYSICAL_COMMON_SKILLS } from './ranged-physical/common';
import { DNC_SKILLS } from './ranged-physical/dnc';
import { MCH_SKILLS } from './ranged-physical/mch';
import { BLM_SKILLS } from './ranged-magical/blm';
import { RANGED_MAGICAL_COMMON_SKILLS } from './ranged-magical/common';
import { PCT_SKILLS } from './ranged-magical/pct';
import { RDM_SKILLS } from './ranged-magical/rdm';
import { SMN_SKILLS } from './ranged-magical/smn';
import { DRK_SKILLS } from './tank/drk';
import { GNB_SKILLS } from './tank/gnb';
import { PLD_SKILLS } from './tank/pld';
import { TANK_COMMON_SKILLS } from './tank/common';
import { WAR_SKILLS } from './tank/war';

export const ROLE_SKILL_IDS = new Set([
  'role-rampart',
  'role-reprisal',
  'role-bloodbath',
  'role-feint',
  'role-addle',
]);
const SKILL_OWNER_SEPARATOR = '@';

export type CombatRole = 'tank' | 'healer' | 'melee' | 'ranged-physical' | 'ranged-magical';

const ROLE_BY_JOB: Record<string, CombatRole> = {
  PLD: 'tank',
  WAR: 'tank',
  DRK: 'tank',
  GNB: 'tank',

  WHM: 'healer',
  SCH: 'healer',
  AST: 'healer',
  SGE: 'healer',

  MNK: 'melee',
  DRG: 'melee',
  NIN: 'melee',
  SAM: 'melee',
  RPR: 'melee',
  VPR: 'melee',

  BRD: 'ranged-physical',
  MCH: 'ranged-physical',
  DNC: 'ranged-physical',

  BLM: 'ranged-magical',
  SMN: 'ranged-magical',
  RDM: 'ranged-magical',
  PCT: 'ranged-magical',
};

const ROLE_BY_ROLE_SKILL_ID: Partial<Record<string, CombatRole>> = {
  'role-rampart': 'tank',
  'role-reprisal': 'tank',
  'role-bloodbath': 'melee',
  'role-feint': 'melee',
  'role-addle': 'ranged-magical',
};

export const getRoleByJob = (job: string): CombatRole | undefined => ROLE_BY_JOB[job];

export const isRoleSkillAvailableForJob = (roleSkillId: string, job: string): boolean => {
  const skillRole = ROLE_BY_ROLE_SKILL_ID[roleSkillId];
  if (!skillRole) return true;

  const jobRole = getRoleByJob(job);
  if (!jobRole) return true;

  return jobRole === skillRole;
};

export const isSkillAvailableForJob = (skill: Skill, job: string): boolean => {
  if (skill.job !== 'ALL') return skill.job === (job as Skill['job']);
  if (!ROLE_SKILL_IDS.has(skill.id)) return true;
  return isRoleSkillAvailableForJob(skill.id, job);
};

export const SKILLS: Skill[] = [
  ...TANK_COMMON_SKILLS,
  ...PLD_SKILLS,
  ...WAR_SKILLS,
  ...DRK_SKILLS,
  ...GNB_SKILLS,

  ...HEALER_COMMON_SKILLS,
  ...WHM_SKILLS,
  ...SCH_SKILLS,
  ...AST_SKILLS,
  ...SGE_SKILLS,

  ...MELEE_COMMON_SKILLS,
  ...MNK_SKILLS,
  ...DRG_SKILLS,
  ...NIN_SKILLS,
  ...SAM_SKILLS,
  ...RPR_SKILLS,
  ...VPR_SKILLS,

  ...RANGED_PHYSICAL_COMMON_SKILLS,
  ...BRD_SKILLS,
  ...MCH_SKILLS,
  ...DNC_SKILLS,

  ...RANGED_MAGICAL_COMMON_SKILLS,
  ...BLM_SKILLS,
  ...SMN_SKILLS,
  ...RDM_SKILLS,
  ...PCT_SKILLS,
];

export const COOLDOWN_GROUP: CooldownGroup[] = [
  {
    id: 'pld-grp-sheltron',
    cooldownSec: 22.6,
    stack: 2,
  },
  {
    id: 'drk-grp-oblation',
    cooldownSec: 60,
    stack: 2,
  },
  {
    id: 'gnb-grp-aurora',
    cooldownSec: 60,
    stack: 2,
  },
  {
    id: 'war-grp-bloodwhetting',
    cooldownSec: 25,
    stack: 1,
  },
  {
    id: 'whm-grp-divine-benison',
    cooldownSec: 30,
    stack: 2,
  },
  {
    id: 'sch-grp-consolation',
    cooldownSec: 30,
    stack: 2,
  },
  {
    id: 'ast-grp-celestial-intersection',
    cooldownSec: 30,
    stack: 2,
  },
  {
    id: 'smn-grp-radiant-aegis',
    cooldownSec: 60,
    stack: 2,
  },
];

export const SKILL_MAP = new Map(SKILLS.map((skill) => [skill.id, skill]));

export const COOLDOWN_GROUP_MAP = new Map(COOLDOWN_GROUP.map((group) => [group.id, group]));

export const COOLDOWN_GROUP_SKILLS_MAP = new Map<string, Skill[]>();
for (const skill of SKILLS) {
  const group = skill.cooldownGroup;
  if (!group || !COOLDOWN_GROUP_MAP.has(group)) continue;

  const groupSkills = COOLDOWN_GROUP_SKILLS_MAP.get(group) || [];
  groupSkills.push(skill);
  COOLDOWN_GROUP_SKILLS_MAP.set(group, groupSkills);
}

export const normalizeSkillId = (skillId: string) => {
  return skillId.split(SKILL_OWNER_SEPARATOR)[0];
};

export const withOwnerSkillId = (skillId: string, ownerJob?: Skill['job']) => {
  const baseId = normalizeSkillId(skillId);
  if (!ownerJob || ownerJob === 'ALL' || !ROLE_SKILL_IDS.has(baseId)) return baseId;
  return `${baseId}${SKILL_OWNER_SEPARATOR}${ownerJob}`;
};

export const getSkillDefinition = (skillId: string) => SKILL_MAP.get(normalizeSkillId(skillId));
