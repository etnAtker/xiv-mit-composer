import type { Skill } from '../../../model/types';

export const SAM_SKILLS: Skill[] = [
  {
    id: 'sam-tengentsu',
    name: '天眼通',
    name_en: 'Tengentsu',
    name_jp: '天眼通',
    name_fr: 'Tengentsû',
    name_de: 'Tengentsu',
    cooldownSec: 15,
    durationSec: 4,
    mitigation: [
      {
        kind: 'damage-down',
        target: 'player',
        pct: 10,
        durationSec: 9,
        damageType: 'all',
        targeting: { kind: 'self' },
      },
      { kind: 'hot', durationSec: 9, potency: 200, targeting: { kind: 'self' } },
    ],
    job: 'SAM',
    color: 'bg-sky-700',
    actionId: 36962,
  },
];
