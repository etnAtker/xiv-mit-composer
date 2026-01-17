import type { Skill } from '../model/types';

export interface StackSimulationResult {
  isValid: boolean;
  shadowZones: { start: number; end: number }[];
  invalidEvents: string[];
}

export function simulateSkillStacks(
  skill: Skill,
  events: { id: string; tStartMs: number }[],
): StackSimulationResult {
  const maxStacks = skill.stack || 1;
  const cooldownMs = skill.cooldownSec * 1000;

  // Sort events by time
  const sorted = [...events].sort((a, b) => a.tStartMs - b.tStartMs);

  let stacks = maxStacks;
  let nextRecoverTime = -1; // -1 means undefined (stack full or timer not running)

  const shadowZones: { start: number; end: number }[] = [];
  const invalidEvents: string[] = [];

  // Helper to process recovery up to time t
  const processRecovery = (t: number) => {
    // If timer is not running, nothing to recover
    if (nextRecoverTime === -1) return;

    // If we are already full, stop timer
    if (stacks >= maxStacks) {
      nextRecoverTime = -1;
      return;
    }

    // Process all recoveries that happened before or at t
    while (nextRecoverTime !== -1 && nextRecoverTime <= t) {
      stacks++;
      if (stacks >= maxStacks) {
        nextRecoverTime = -1;
        break;
      } else {
        // Continue timer for next stack
        nextRecoverTime += cooldownMs;
      }
    }
  };

  for (const ev of sorted) {
    processRecovery(ev.tStartMs);

    if (stacks > 0) {
      stacks--;

      // If we depleted a stack and timer wasn't running (meaning we were max), start it.
      // Note: If we were at max, nextRecoverTime was -1.
      if (nextRecoverTime === -1) {
        nextRecoverTime = ev.tStartMs + cooldownMs;
      }

      // If we hit 0 stacks, create a shadow zone until next recovery
      if (stacks === 0) {
        shadowZones.push({
          start: ev.tStartMs,
          end: nextRecoverTime,
        });
      }
    } else {
      // Insufficient stacks
      invalidEvents.push(ev.id);
    }
  }

  return {
    isValid: invalidEvents.length === 0,
    shadowZones,
    invalidEvents,
  };
}
