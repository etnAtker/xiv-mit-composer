import type { Skill } from '../../../model/types';

export const NIN_SKILLS: Skill[] = [
  {
    id: 'nin-shade-shift',
    name: '残影',
    name_en: 'Shade Shift',
    name_jp: '残影',
    name_fr: "Décalage d'ombre",
    name_de: 'Superkniff',
    cooldownSec: 120,
    durationSec: 20,
    mitigation: [{ kind: 'shield', durationSec: 20, maxHpPct: 20, targeting: { kind: 'self' } }],
    job: 'NIN',
    color: 'bg-gray-700',
    actionId: 2241,
  },
];
