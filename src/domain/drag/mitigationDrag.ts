import { withOwnerSkillId, getSkillDefinition } from '../../data/skills';
import type { CooldownEvent, Job, MitEvent } from '../../model/types';
import { MS_PER_SEC } from '../../constants/time';
import { canInsertMitigation } from '../../utils/playerCast';

export interface OwnerContext {
  ownerJob?: Job;
  ownerId?: number;
}

export interface ExistingMitDragContext {
  eventsToMove: MitEvent[];
}

interface BuildMitEventFromSkillInput extends OwnerContext {
  skillId: string;
  tStartMs: number;
  id?: string;
}

interface ExistingMitDropValidationInput {
  sourceMit: MitEvent;
  tStartMs: number;
  eventsToMove: MitEvent[];
  mitEvents: MitEvent[];
}

export function resolveEventsToMove(
  currentMit: MitEvent,
  selectedMitIds: string[],
  mitEvents: MitEvent[],
): MitEvent[] {
  if (!selectedMitIds.includes(currentMit.id)) {
    return [currentMit];
  }
  return mitEvents.filter((mit) => selectedMitIds.includes(mit.id));
}

export function prepareExistingMitDrag(
  currentMit: MitEvent,
  selectedMitIds: string[],
  mitEvents: MitEvent[],
): ExistingMitDragContext {
  const eventsToMove = resolveEventsToMove(currentMit, selectedMitIds, mitEvents);
  return { eventsToMove };
}

export function resolveDropStartMs(
  translatedTop: number,
  dropTop: number,
  msPerPx: number,
): number {
  return Math.max(0, translatedTop - dropTop) * msPerPx;
}

export function resolveMitRemovalIds(currentMit: MitEvent, selectedMitIds: string[]): string[] {
  return selectedMitIds.includes(currentMit.id) ? selectedMitIds : [currentMit.id];
}

export function buildMitEventFromSkill({
  skillId,
  tStartMs,
  id = crypto.randomUUID(),
  ownerJob,
  ownerId,
}: BuildMitEventFromSkillInput): MitEvent | null {
  const skillDef = getSkillDefinition(skillId);
  if (!skillDef) return null;

  const durationMs = skillDef.durationSec * MS_PER_SEC;
  return {
    eventType: 'mit',
    id,
    skillId: withOwnerSkillId(skillDef.id, ownerJob),
    tStartMs,
    durationMs,
    tEndMs: tStartMs + durationMs,
    ownerId,
    ownerJob,
  };
}

export function canDropNewMitigation(
  skillId: string,
  tStartMs: number,
  mitEvents: MitEvent[],
  cooldownEvents: CooldownEvent[],
  ownerContext: OwnerContext,
): boolean {
  return canInsertMitigation(
    skillId,
    tStartMs,
    mitEvents,
    ownerContext.ownerJob,
    ownerContext.ownerId,
    undefined,
    cooldownEvents,
  );
}

export function canDropExistingMitigations({
  sourceMit,
  tStartMs,
  eventsToMove,
  mitEvents,
}: ExistingMitDropValidationInput): boolean {
  const movedEvents = buildMovedCandidateEvents(sourceMit, tStartMs, eventsToMove);
  if (!movedEvents) {
    return false;
  }

  const movingIds = new Set(eventsToMove.map((mit) => mit.id));
  const staticEvents = mitEvents.filter((mit) => !movingIds.has(mit.id));
  const candidateEvents = [...staticEvents, ...movedEvents];

  return movedEvents.every((mit) =>
    canInsertMitigation(
      mit.skillId,
      mit.tStartMs,
      candidateEvents,
      mit.ownerJob ?? undefined,
      mit.ownerId ?? undefined,
      new Set([mit.id]),
    ),
  );
}

export function buildMovedMitEvents(input: ExistingMitDropValidationInput): MitEvent[] | null {
  if (!canDropExistingMitigations(input)) {
    return null;
  }

  return buildMovedCandidateEvents(input.sourceMit, input.tStartMs, input.eventsToMove);
}

function buildMovedCandidateEvents(
  sourceMit: MitEvent,
  tStartMs: number,
  eventsToMove: MitEvent[],
): MitEvent[] | null {
  const deltaMs = tStartMs - sourceMit.tStartMs;
  const movedEvents: MitEvent[] = [];

  for (const mit of eventsToMove) {
    const newStart = mit.tStartMs + deltaMs;
    if (newStart < 0) {
      return null;
    }

    movedEvents.push({
      ...mit,
      tStartMs: newStart,
      tEndMs: newStart + mit.durationMs,
    });
  }

  return movedEvents;
}
