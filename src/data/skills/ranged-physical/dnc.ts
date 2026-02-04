import type { Skill } from '../../../model/types';

export const DNC_SKILLS: Skill[] = [
  {
    id: 'dnc-shield-samba',
    name: '防守之桑巴',
    name_en: 'Shield Samba',
    name_jp: '守りのサンバ',
    name_fr: 'Samba protectrice',
    name_de: 'Schildsamba',
    cooldownSec: 90,
    durationSec: 15,
    mitigation: [
      {
        kind: 'damage-down',
        target: 'player',
        pct: 15,
        durationSec: 15,
        damageType: 'all',
        targeting: { kind: 'party' },
      },
    ],
    job: 'DNC',
    color: 'bg-fuchsia-700',
    actionId: 16012,
  },
];
