import type { Skill } from '../../../model/types';

export const RPR_SKILLS: Skill[] = [
  {
    id: 'rpr-arcane-crest',
    name: '神秘纹',
    name_en: 'Arcane Crest',
    name_jp: 'アルケインクレスト',
    name_fr: 'Blason arcanique',
    name_de: 'Arkanes Wappen',
    cooldownSec: 30,
    durationSec: 5,
    mitigation: [
      { kind: 'shield', durationSec: 5, maxHpPct: 10, targeting: { kind: 'self' } },
      { kind: 'hot', durationSec: 15, potency: 50, targeting: { kind: 'party' } },
    ],
    job: 'RPR',
    color: 'bg-violet-700',
    actionId: 24404,
  },
];
