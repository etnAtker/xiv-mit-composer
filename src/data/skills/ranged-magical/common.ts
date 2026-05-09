import type { Skill } from '../../../model/types';

export const RANGED_MAGICAL_COMMON_SKILLS: Skill[] = [
  {
    id: 'role-addle',
    name: '昏乱',
    name_en: 'Addle',
    name_jp: 'アドル',
    name_fr: 'Embrouillement',
    name_de: 'Stumpfsinn',
    cooldownSec: 90,
    durationSec: 15,
    mitigation: [
      {
        kind: 'damage-down',
        target: 'boss',
        pct: 5,
        durationSec: 15,
        damageType: 'physical',
        targeting: { kind: 'party' },
      },
      {
        kind: 'damage-down',
        target: 'boss',
        pct: 10,
        durationSec: 15,
        damageType: 'magical',
        targeting: { kind: 'party' },
      },
    ],
    job: 'ALL',
    actionId: 7560,
    counterpartProjection: true,
  },
];
