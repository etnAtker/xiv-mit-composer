import type { Skill } from '../../../model/types';

export const PCT_SKILLS: Skill[] = [
  {
    id: 'pct-tempera-coat',
    name: '坦培拉涂层',
    name_en: 'Tempera Coat',
    name_jp: 'テンペラコート',
    name_fr: 'Enduit a tempera',
    name_de: 'Tempera-Schicht',
    cooldownSec: 120,
    durationSec: 10,
    mitigation: [{ kind: 'shield', durationSec: 10, maxHpPct: 20, targeting: { kind: 'self' } }],
    job: 'PCT',
    color: 'bg-rose-700',
    actionId: 34685,
  },
];
