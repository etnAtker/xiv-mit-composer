import type { Skill } from '../../../model/types';

export const MELEE_COMMON_SKILLS: Skill[] = [
  {
    id: 'role-feint',
    name: '牵制',
    name_en: 'Feint',
    name_jp: '牽制',
    name_fr: 'Restreinte',
    name_de: 'Zermürben',
    cooldownSec: 90,
    durationSec: 15,
    mitigation: [
      {
        kind: 'damage-down',
        target: 'boss',
        pct: 10,
        durationSec: 15,
        damageType: 'physical',
        targeting: { kind: 'party' },
      },
      {
        kind: 'damage-down',
        target: 'boss',
        pct: 5,
        durationSec: 15,
        damageType: 'magical',
        targeting: { kind: 'party' },
      },
    ],
    job: 'ALL',
    actionId: 7549,
    counterpartProjection: true,
  },
];
