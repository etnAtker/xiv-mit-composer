import type { Actor, Job } from './types';

export const JOBS: Job[] = [
  'PLD',
  'WAR',
  'DRK',
  'GNB',
  'WHM',
  'SCH',
  'AST',
  'SGE',
  'MNK',
  'DRG',
  'NIN',
  'SAM',
  'RPR',
  'VPR',
  'BRD',
  'MCH',
  'DNC',
  'BLM',
  'SMN',
  'RDM',
  'PCT',
];

export const JOB_TYPE_MAP: Record<Job, string[]> = {
  PLD: ['Paladin'],
  WAR: ['Warrior'],
  DRK: ['DarkKnight', 'Dark Knight'],
  GNB: ['Gunbreaker'],
  WHM: ['WhiteMage', 'White Mage'],
  SCH: ['Scholar'],
  AST: ['Astrologian'],
  SGE: ['Sage'],
  MNK: ['Monk'],
  DRG: ['Dragoon'],
  NIN: ['Ninja'],
  SAM: ['Samurai'],
  RPR: ['Reaper'],
  VPR: ['Viper'],
  BRD: ['Bard'],
  MCH: ['Machinist'],
  DNC: ['Dancer'],
  BLM: ['BlackMage', 'Black Mage'],
  SMN: ['Summoner'],
  RDM: ['RedMage', 'Red Mage'],
  PCT: ['Pictomancer'],
};

export function resolveActorJob(actor: Pick<Actor, 'type' | 'subType'>): Job | null {
  return (
    JOBS.find(
      (job) => JOB_TYPE_MAP[job].includes(actor.type) || JOB_TYPE_MAP[job].includes(actor.subType),
    ) ?? null
  );
}
