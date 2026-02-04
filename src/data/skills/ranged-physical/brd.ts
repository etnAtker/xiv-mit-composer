import type { Skill } from '../../../model/types';

export const BRD_SKILLS: Skill[] = [
  {
    id: 'brd-troubadour',
    name: '行吟',
    name_en: 'Troubadour',
    name_jp: 'トルバドゥール',
    name_fr: 'Troubadour',
    name_de: 'Troubadour',
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
    job: 'BRD',
    color: 'bg-pink-700',
    actionId: 7405,
  },
  {
    id: 'brd-natures-minne',
    name: '大地神的抒情恋歌',
    name_en: "Nature's Minne",
    name_jp: '地神のミンネ',
    name_fr: 'Minne de la nature',
    name_de: 'Nophicas Minne',
    cooldownSec: 120,
    durationSec: 15,
    job: 'BRD',
    color: 'bg-pink-600',
    actionId: 7408,
  },
];
