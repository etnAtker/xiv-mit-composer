import type { Skill } from '../../../model/types';

export const MCH_SKILLS: Skill[] = [
  {
    id: 'mch-tactician',
    name: '策动',
    name_en: 'Tactician',
    name_jp: 'タクティシャン',
    name_fr: 'Tacticien',
    name_de: 'Taktiker',
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
    job: 'MCH',
    color: 'bg-slate-700',
    actionId: 16889,
  },
  {
    id: 'mch-dismantle',
    name: '武装解除',
    name_en: 'Dismantle',
    name_jp: 'ウェポンブレイク',
    name_fr: 'Brise-arme',
    name_de: 'Zerlegen',
    cooldownSec: 120,
    durationSec: 10,
    mitigation: [
      {
        kind: 'damage-down',
        target: 'boss',
        pct: 10,
        durationSec: 10,
        damageType: 'all',
        targeting: { kind: 'party' },
      },
    ],
    job: 'MCH',
    color: 'bg-slate-600',
    actionId: 2887,
  },
];
