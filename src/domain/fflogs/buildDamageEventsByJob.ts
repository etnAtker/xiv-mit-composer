import type { DamageEvent, Job } from '../../model/types';
import { mergeDamageEvents } from './mergeDamageEvents';

export function buildDamageEventsByJob(
  batches: { job: Job; events: DamageEvent[] }[],
  fightStart: number,
): Partial<Record<Job, DamageEvent[]>> {
  const damageEventsByJob: Partial<Record<Job, DamageEvent[]>> = {};
  batches.forEach(({ job, events }) => {
    damageEventsByJob[job] = mergeDamageEvents(events, fightStart);
  });
  return damageEventsByJob;
}
