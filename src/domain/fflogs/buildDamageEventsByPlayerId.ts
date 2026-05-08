import type { DamageEvent, DamageEventsByPlayerId } from '../../model/types';
import { mergeDamageEvents } from './mergeDamageEvents';

export function buildDamageEventsByPlayerId(
  batches: { playerId: number; events: DamageEvent[] }[],
  fightStart: number,
): DamageEventsByPlayerId {
  const damageEventsByPlayerId: DamageEventsByPlayerId = {};
  batches.forEach(({ playerId, events }) => {
    damageEventsByPlayerId[playerId] = mergeDamageEvents(events, fightStart);
  });
  return damageEventsByPlayerId;
}
