import type { Skill } from '../../../model/types';

export const BLM_SKILLS: Skill[] = [
  {
    id: 'blm-manaward',
    name: '魔罩',
    name_en: 'Manaward',
    name_jp: 'マバリア',
    name_fr: 'Barrière de mana',
    name_de: 'Mana-Schild',
    cooldownSec: 120,
    durationSec: 20,
    mitigation: [{ kind: 'shield', durationSec: 20, maxHpPct: 30, targeting: { kind: 'self' } }],
    job: 'BLM',
    color: 'bg-indigo-900',
    actionId: 157,
  },
];
