import type { Skill } from '../../../model/types';

export const RDM_SKILLS: Skill[] = [
  {
    id: 'rdm-magick-barrier',
    name: '抗死',
    name_en: 'Magick Barrier',
    name_jp: 'バマジク',
    name_fr: 'Barrière anti-magie',
    name_de: 'Magiebarriere',
    cooldownSec: 120,
    durationSec: 10,
    mitigation: [
      {
        kind: 'damage-down',
        target: 'player',
        pct: 10,
        durationSec: 10,
        damageType: 'magical',
        targeting: { kind: 'party' },
      },
    ],
    job: 'RDM',
    color: 'bg-red-700',
    actionId: 25857,
  },
];
