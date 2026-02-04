import type { Skill } from '../../../model/types';

export const SMN_SKILLS: Skill[] = [
  {
    id: 'smn-radiant-aegis',
    name: '守护之光',
    name_en: 'Radiant Aegis',
    name_jp: '守りの光',
    name_fr: 'Égide rayonnante',
    name_de: 'Schimmerschild',
    cooldownSec: 0.5,
    durationSec: 30,
    mitigation: [{ kind: 'shield', durationSec: 30, maxHpPct: 20, targeting: { kind: 'self' } }],
    job: 'SMN',
    color: 'bg-emerald-700',
    actionId: 25799,
    cooldownGroup: 'smn-grp-radiant-aegis',
  },
];
