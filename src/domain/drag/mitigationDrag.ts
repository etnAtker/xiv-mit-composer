import { withOwnerSkillId, getSkillDefinition, normalizeSkillId } from '../../data/skills';
import type { CooldownEvent, Job, MitEvent, Skill } from '../../model/types';
import { MS_PER_SEC } from '../../constants/time';
import { canInsertMitigation, evaluateMitigationSetStrict } from '../../utils/playerCast';

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

export function resolveDropCenterMs(
  translatedTop: number,
  translatedHeight: number,
  dropTop: number,
  msPerPx: number,
): number {
  return Math.max(0, translatedTop + translatedHeight / 2 - dropTop) * msPerPx;
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
  if (canApplyDurationEnd(skillId, tStartMs, mitEvents, ownerContext)) {
    return true;
  }

  const skillDef = getSkillDefinition(skillId);
  if (skillDef?.kind === 'durationEnder') {
    return false;
  }

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

export function isDurationEnderSkill(skillId: string): boolean {
  const skillDef = getSkillDefinition(skillId);
  return !!skillDef?.durationEnder;
}

export function canApplyDurationEnd(
  skillId: string,
  tMs: number,
  mitEvents: MitEvent[],
  ownerContext: OwnerContext,
): boolean {
  return !!findDurationEndParentEvent(skillId, tMs, mitEvents, ownerContext);
}

export function buildDurationEndMitEvents(
  skillId: string,
  tMs: number,
  mitEvents: MitEvent[],
  ownerContext: OwnerContext,
): MitEvent[] | null {
  const parent = findDurationEndParentEvent(skillId, tMs, mitEvents, ownerContext);
  if (!parent) return null;

  const triggerSkillId = normalizeSkillId(skillId);
  return mitEvents.map((mit) => {
    if (mit.id !== parent.id) return mit;
    return {
      ...mit,
      durationMs: tMs - mit.tStartMs,
      tEndMs: tMs,
      endedBy: {
        skillId: triggerSkillId,
        tMs,
      },
    };
  });
}

export function canUpdateDurationEnd(
  parentMitId: string,
  tMs: number,
  mitEvents: MitEvent[],
): boolean {
  return !!buildDurationEndUpdate(parentMitId, tMs, mitEvents);
}

export function buildUpdatedDurationEndMitEvents(
  parentMitId: string,
  skillId: string,
  tMs: number,
  mitEvents: MitEvent[],
): MitEvent[] | null {
  const update = buildDurationEndUpdate(parentMitId, tMs, mitEvents);
  if (!update) return null;

  return mitEvents.map((mit) =>
    mit.id === parentMitId
      ? {
          ...mit,
          durationMs: tMs - mit.tStartMs,
          tEndMs: tMs,
          endedBy: {
            skillId: normalizeSkillId(skillId),
            tMs,
          },
        }
      : mit,
  );
}

export function buildClearedDurationEndMitEvents(
  parentMitId: string,
  mitEvents: MitEvent[],
): MitEvent[] | null {
  const parent = mitEvents.find((mit) => mit.id === parentMitId);
  if (!parent?.endedBy) return null;

  const parentSkill = getSkillDefinition(parent.skillId);
  if (!parentSkill) return null;

  const durationMs = parentSkill.durationSec * MS_PER_SEC;
  return mitEvents.map((mit) =>
    mit.id === parentMitId
      ? {
          ...mit,
          durationMs,
          tEndMs: mit.tStartMs + durationMs,
          endedBy: undefined,
        }
      : mit,
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
  const candidateResult = evaluateMitigationSetStrict([...staticEvents, ...movedEvents]);
  return candidateResult.ok;
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
      endedBy: mit.endedBy
        ? {
            ...mit.endedBy,
            tMs: mit.endedBy.tMs + deltaMs,
          }
        : undefined,
    });
  }

  return movedEvents;
}

function buildDurationEndUpdate(
  parentMitId: string,
  tMs: number,
  mitEvents: MitEvent[],
): { parent: MitEvent; fullEndMs: number } | null {
  const parent = mitEvents.find((mit) => mit.id === parentMitId);
  if (!parent?.endedBy) return null;

  const parentSkill = getSkillDefinition(parent.skillId);
  if (!parentSkill) return null;

  const fullEndMs = parent.tStartMs + parentSkill.durationSec * MS_PER_SEC;
  if (tMs <= parent.tStartMs || tMs > fullEndMs) return null;

  return { parent, fullEndMs };
}

function findDurationEndParentEvent(
  skillId: string,
  tMs: number,
  mitEvents: MitEvent[],
  ownerContext: OwnerContext,
): MitEvent | null {
  const triggerSkillId = normalizeSkillId(skillId);
  const triggerSkill = getSkillDefinition(triggerSkillId);
  if (!triggerSkill) return null;

  const parentSkillIds = new Set<string>();
  if (triggerSkill.durationEnder?.parentSkillId) {
    parentSkillIds.add(triggerSkill.durationEnder.parentSkillId);
  }
  if (triggerSkill.durationEnd?.allowSelfRecast) {
    parentSkillIds.add(triggerSkill.id);
  }

  if (!parentSkillIds.size) return null;

  let parent: MitEvent | null = null;
  for (const mit of mitEvents) {
    if (!matchesOwner(mit, ownerContext)) continue;

    const parentSkillId = normalizeSkillId(mit.skillId);
    if (!parentSkillIds.has(parentSkillId)) continue;

    const parentSkill = getSkillDefinition(parentSkillId);
    if (!parentSkill) continue;
    if (!canSkillBeEndedBy(parentSkill, triggerSkillId)) continue;

    const fullEndMs = mit.tStartMs + parentSkill.durationSec * MS_PER_SEC;
    if (tMs <= mit.tStartMs || tMs > fullEndMs) continue;
    if (!parent || mit.tStartMs > parent.tStartMs) {
      parent = mit;
    }
  }

  return parent;
}

function canSkillBeEndedBy(parentSkill: Skill, triggerSkillId: string) {
  if (parentSkill.id === triggerSkillId) {
    return !!parentSkill.durationEnd?.allowSelfRecast;
  }
  return !!parentSkill.durationEnd?.triggerSkillIds?.includes(triggerSkillId);
}

function matchesOwner(mit: MitEvent, ownerContext: OwnerContext) {
  if (typeof ownerContext.ownerId === 'number' || typeof mit.ownerId === 'number') {
    return mit.ownerId === ownerContext.ownerId;
  }
  if (ownerContext.ownerJob || mit.ownerJob) {
    return mit.ownerJob === ownerContext.ownerJob;
  }
  return true;
}
