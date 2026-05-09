import type { Skill } from '../../../model/types';

export const TANK_COMMON_SKILLS: Skill[] = [
  // 职能通用
  {
    id: 'role-reprisal',
    name: '雪仇',
    name_en: 'Reprisal',
    name_jp: 'リプライザル',
    name_fr: 'Rétorsion',
    name_de: 'Reflexion',
    cooldownSec: 60,
    durationSec: 15,
    mitigation: [
      {
        kind: 'damage-down',
        target: 'boss',
        pct: 10,
        durationSec: 15,
        damageType: 'all',
        targeting: { kind: 'party' },
      },
    ],
    job: 'ALL',
    actionId: 7535,
    counterpartProjection: true,
  },
  {
    id: 'role-rampart',
    name: '铁壁',
    name_en: 'Rampart',
    name_jp: 'ランパート',
    name_fr: 'Rempart',
    name_de: 'Schutzwall',
    cooldownSec: 90,
    durationSec: 20,
    mitigation: [
      {
        kind: 'damage-down',
        target: 'player',
        pct: 20,
        durationSec: 20,
        damageType: 'all',
        targeting: { kind: 'self' },
      },
    ],
    job: 'ALL',
    actionId: 7531,
  },
];
