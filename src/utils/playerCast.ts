import type { CooldownEvent, MitEvent, PlayerEvent } from '../model/types';

export function adjustEvents(
  eventsToAdjust: MitEvent[],
  events: PlayerEvent[],
): PlayerEvent[] | void {
  const adjustIds = new Set(eventsToAdjust.map((e) => e.id));
  events = sanitizeEvents(
    events.filter((event) => {
      if (event.eventType === 'mit') {
        const e = event as MitEvent;
        return adjustIds.has(e.id);
      } else {
        const e = event as CooldownEvent;
        return adjustIds.has(e.mitId);
      }
    }),
  );

  for (const adjusting of eventsToAdjust) {
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      if (event.eventType === 'mit') return;

      const cooldown = event as CooldownEvent;
      if (cooldown.tEndMs < adjusting.tStartMs) continue;

      if (cooldown.tStartMs > adjusting.tEndMs) {
        events.splice(i, 0, adjusting);
        break;
      }

      return;
    }
  }
}

function sanitizeEvents(events: PlayerEvent[]): PlayerEvent[] {
  const mitEvents = events
    .filter((e) => e.eventType === 'mit')
    .map((e) => e as MitEvent)
    .sort((a, b) => a.tStartMs - b.tStartMs);
  const newEvents = new Array<PlayerEvent>();

  return newEvents;
}
