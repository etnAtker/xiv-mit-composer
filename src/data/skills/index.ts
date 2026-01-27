import type { CooldownGroup, Skill } from '../../model/types';

export const ROLE_SKILL_IDS = new Set(['role-rampart', 'role-reprisal']);
const SKILL_OWNER_SEPARATOR = '@';

export const SKILLS: Skill[] = [
  // 职能通用
  {
    id: 'role-reprisal',
    name: '雪仇',
    cooldownSec: 60,
    durationSec: 15,
    job: 'ALL',
    color: 'bg-slate-600',
    actionId: 7535,
  },
  {
    id: 'role-rampart',
    name: '铁壁',
    cooldownSec: 90,
    durationSec: 20,
    job: 'ALL',
    color: 'bg-slate-500',
    actionId: 7531,
  },

  // 骑士 (PLD)

  {
    id: 'pld-bulwark',
    name: '壁垒',
    cooldownSec: 90,
    durationSec: 10,
    job: 'PLD',
    color: 'bg-blue-700',
    actionId: 22,
  },
  {
    id: 'pld-sentinel',
    name: '绝对防御',
    cooldownSec: 120,
    durationSec: 15,
    job: 'PLD',
    color: 'bg-blue-600',
    actionId: 17,
  },
  {
    id: 'pld-h-sheltron',
    name: '圣盾阵',
    cooldownSec: 4,
    durationSec: 8,
    job: 'PLD',
    color: 'bg-blue-400',
    actionId: 25746,
    cooldownGroup: 'pld-grp-sheltron',
  },
  {
    id: 'pld-intervention',
    name: '干预',
    cooldownSec: 10,
    durationSec: 8,
    job: 'PLD',
    color: 'bg-blue-400',
    actionId: 7382,
    cooldownGroup: 'pld-grp-sheltron',
  },
  {
    id: 'pld-hallowed-ground',
    name: '神圣领域',
    cooldownSec: 420,
    durationSec: 10,
    job: 'PLD',
    color: 'bg-blue-950',
    actionId: 30,
  },
  {
    id: 'pld-passage',
    name: '武装戍卫',
    cooldownSec: 120,
    durationSec: 18,
    job: 'PLD',
    color: 'bg-blue-800',
    actionId: 7385,
  },
  {
    id: 'pld-divine-veil',
    name: '圣光幕帘',
    cooldownSec: 90,
    durationSec: 30,
    job: 'PLD',
    color: 'bg-blue-900',
    actionId: 3540,
  },

  // 战士 (WAR)

  {
    id: 'war-thrill',
    name: '战栗',
    cooldownSec: 90,
    durationSec: 10,
    job: 'WAR',
    color: 'bg-red-700',
    actionId: 40,
  },
  {
    id: 'war-equilibrium',
    name: '泰然自若',
    cooldownSec: 60,
    durationSec: 15,
    job: 'WAR',
    color: 'bg-red-200',
    actionId: 3552,
  },
  {
    id: 'war-damnation',
    name: '戮罪',
    cooldownSec: 120,
    durationSec: 15,
    job: 'WAR',
    color: 'bg-red-600',
    actionId: 36923,
  },
  {
    id: 'war-bloodwhetting',
    name: '原初的血气',
    cooldownSec: 25,
    durationSec: 8,
    job: 'WAR',
    color: 'bg-red-400',
    actionId: 25751,
    cooldownGroup: 'war-grp-bloodwhetting',
  },
  {
    id: 'war-nascent-flash',
    name: '原初的勇猛',
    cooldownSec: 25,
    durationSec: 8,
    job: 'WAR',
    color: 'bg-red-400',
    actionId: 16464,
    cooldownGroup: 'war-grp-bloodwhetting',
  },
  {
    id: 'war-holmgang',
    name: '死斗',
    cooldownSec: 240,
    durationSec: 10,
    job: 'WAR',
    color: 'bg-red-900',
    actionId: 43,
  },
  {
    id: 'war-shake-it-off',
    name: '摆脱',
    cooldownSec: 90,
    durationSec: 15,
    job: 'WAR',
    color: 'bg-red-800',
    actionId: 7388,
  },

  // 暗黑骑士 (DRK)

  {
    id: 'drk-dark-mind',
    name: '弃明投暗',
    cooldownSec: 60,
    durationSec: 10,
    job: 'DRK',
    color: 'bg-purple-500',
    actionId: 3634,
  },
  {
    id: 'drk-oblation',
    name: '献奉',
    cooldownSec: 0.5,
    durationSec: 10,
    job: 'DRK',
    color: 'bg-purple-700',
    actionId: 25754,
    cooldownGroup: 'drk-grp-oblation',
  },
  {
    id: 'drk-shadow-wall',
    name: '暗影卫',
    cooldownSec: 120,
    durationSec: 15,
    job: 'DRK',
    color: 'bg-purple-600',
    actionId: 36927,
  },
  {
    id: 'drk-tbn',
    name: '至黑之夜',
    cooldownSec: 15,
    durationSec: 7,
    job: 'DRK',
    color: 'bg-purple-400',
    actionId: 7393,
  },
  {
    id: 'drk-living-dead',
    name: '行尸走肉',
    cooldownSec: 300,
    durationSec: 10,
    job: 'DRK',
    color: 'bg-purple-900',
    actionId: 3638,
  },
  {
    id: 'drk-dark-missionary',
    name: '暗黑布道',
    cooldownSec: 90,
    durationSec: 15,
    job: 'DRK',
    color: 'bg-purple-800',
    actionId: 16471,
  },

  // 绝枪战士 (GNB)

  {
    id: 'gnb-aurora',
    name: '极光',
    cooldownSec: 0.5,
    durationSec: 18,
    job: 'GNB',
    color: 'bg-orange-200',
    actionId: 16151,
    cooldownGroup: 'gnb-grp-aurora',
  },
  {
    id: 'gnb-camouflage',
    name: '伪装',
    cooldownSec: 90,
    durationSec: 20,
    job: 'GNB',
    color: 'bg-orange-700',
    actionId: 16140,
  },
  {
    id: 'gnb-nebula',
    name: '大星云',
    cooldownSec: 120,
    durationSec: 15,
    job: 'GNB',
    color: 'bg-orange-600',
    actionId: 36935,
  },
  {
    id: 'gnb-hoc',
    name: '刚玉之心',
    cooldownSec: 25,
    durationSec: 8,
    job: 'GNB',
    color: 'bg-orange-400',
    actionId: 25758,
  },
  {
    id: 'gnb-superbolide',
    name: '超火流星',
    cooldownSec: 360,
    durationSec: 10,
    job: 'GNB',
    color: 'bg-orange-900',
    actionId: 16152,
  },
  {
    id: 'gnb-heart-of-light',
    name: '光之心',
    cooldownSec: 90,
    durationSec: 15,
    job: 'GNB',
    color: 'bg-orange-800',
    actionId: 16160,
  },
];

export const COOLDOWN_GROUP: CooldownGroup[] = [
  {
    id: 'pld-grp-sheltron',
    cooldownSec: 25,
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

export const normalizeSkillId = (skillId: string) => skillId.split(SKILL_OWNER_SEPARATOR)[0];

export const withOwnerSkillId = (skillId: string, ownerJob?: Skill['job']) => {
  const baseId = normalizeSkillId(skillId);
  if (!ownerJob || ownerJob === 'ALL' || !ROLE_SKILL_IDS.has(baseId)) return baseId;
  return `${baseId}${SKILL_OWNER_SEPARATOR}${ownerJob}`;
};

export const getSkillDefinition = (skillId: string) => SKILL_MAP.get(normalizeSkillId(skillId));
