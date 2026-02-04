import type { Skill } from '../../../model/types';

export const MNK_SKILLS: Skill[] = [
  {
    id: 'mnk-mantra',
    name: '真言',
    name_en: 'Mantra',
    name_jp: 'マントラ',
    name_fr: 'Mantra',
    name_de: 'Mantra',
    cooldownSec: 90,
    durationSec: 15,
    job: 'MNK',
    color: 'bg-yellow-700',
    actionId: 65,
  },
  {
    id: 'mnk-riddle-of-earth',
    name: '金刚极意',
    name_en: 'Riddle of Earth',
    name_jp: '金剛の極意',
    name_fr: 'Énigme de la terre',
    name_de: 'Steinernes Enigma',
    cooldownSec: 120,
    durationSec: 10,
    mitigation: [
      {
        kind: 'damage-down',
        target: 'player',
        pct: 20,
        durationSec: 10,
        damageType: 'all',
        targeting: { kind: 'self' },
      },
    ],
    job: 'MNK',
    color: 'bg-yellow-800',
    actionId: 7394,
  },
];
