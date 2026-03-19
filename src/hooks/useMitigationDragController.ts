import { useCallback, useRef, useState } from 'react';
import type { DragEndEvent, DragMoveEvent, DragStartEvent } from '@dnd-kit/core';
import type { CooldownEvent, Job, MitEvent } from '../model/types';
import type { DragItemData, DropZoneData } from '../dnd/types';
import { useStore } from '../store';
import type { PushBanner } from './useTopBanner';
import {
  buildMitEventFromSkill,
  buildMovedMitEvents,
  canDropExistingMitigations,
  canDropNewMitigation,
  prepareExistingMitDrag,
  resolveDropStartMs,
  resolveMitRemovalIds,
} from '../domain/drag/mitigationDrag';

interface DualTankPlayer {
  id: number | null;
  job: Job;
}

interface UseMitigationDragControllerOptions {
  selectedJob: Job | null;
  selectedPlayerId: number | null;
  loadMode: 'single' | 'dual';
  dualTankPlayers: DualTankPlayer[];
  mitEvents: MitEvent[];
  cooldownEvents: CooldownEvent[];
  addMitEvent: (event: MitEvent) => void;
  setMitEvents: (events: MitEvent[]) => void;
  setSelectedMitIds: (ids: string[]) => void;
  push: PushBanner;
}

export function useMitigationDragController({
  selectedJob,
  selectedPlayerId,
  loadMode,
  dualTankPlayers,
  mitEvents,
  cooldownEvents,
  addMitEvent,
  setMitEvents,
  setSelectedMitIds,
  push,
}: UseMitigationDragControllerOptions) {
  const [activeItem, setActiveItem] = useState<DragItemData | null>(null);
  const [dragPreviewPx, setDragPreviewPx] = useState(0);
  const [dragInvalid, setDragInvalid] = useState(false);
  const activeItemRef = useRef<DragItemData | null>(null);
  const dragPreviewRef = useRef(0);
  const dragPreviewRafRef = useRef<number | null>(null);
  const dragInvalidRef = useRef(false);
  const dragMovingEventsRef = useRef<MitEvent[]>([]);

  const resolveOwnerContext = useCallback(
    (job?: Job) => {
      const resolvedJob = job ?? selectedJob ?? undefined;
      if (loadMode === 'dual') {
        const match = dualTankPlayers.find((player) => player.job === resolvedJob);
        return { ownerJob: resolvedJob, ownerId: match?.id ?? undefined };
      }
      return { ownerJob: resolvedJob, ownerId: selectedPlayerId ?? undefined };
    },
    [dualTankPlayers, loadMode, selectedJob, selectedPlayerId],
  );

  const clearDragRuntime = useCallback(() => {
    dragInvalidRef.current = false;
    setDragInvalid(false);
    dragMovingEventsRef.current = [];
    dragPreviewRef.current = 0;

    if (dragPreviewRafRef.current !== null) {
      cancelAnimationFrame(dragPreviewRafRef.current);
      dragPreviewRafRef.current = null;
    }

    setDragPreviewPx(0);
  }, []);

  const resetDragSession = useCallback(() => {
    activeItemRef.current = null;
    setActiveItem(null);
    clearDragRuntime();
  }, [clearDragRuntime]);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const currentItem = event.active.data.current as DragItemData | undefined;
      activeItemRef.current = currentItem ?? null;
      setActiveItem(currentItem ?? null);

      if (currentItem?.type === 'new-skill') {
        setSelectedMitIds([]);
      }

      clearDragRuntime();

      if (currentItem?.type !== 'existing-mit') {
        return;
      }

      const selectedMitIds = useStore.getState().selectedMitIds;
      const dragContext = prepareExistingMitDrag(currentItem.mit, selectedMitIds, mitEvents);
      dragMovingEventsRef.current = dragContext.eventsToMove;
    },
    [clearDragRuntime, mitEvents, setSelectedMitIds],
  );

  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      dragPreviewRef.current = event.delta.y;
      if (dragPreviewRafRef.current === null) {
        dragPreviewRafRef.current = requestAnimationFrame(() => {
          dragPreviewRafRef.current = null;
          setDragPreviewPx(dragPreviewRef.current);
        });
      }

      const translated = event.active.rect.current?.translated;
      const over = event.over;
      const zone = over?.data.current as DropZoneData | undefined;
      if (!translated || !over || !zone || zone.kind !== 'mit-lane') {
        if (dragInvalidRef.current) {
          dragInvalidRef.current = false;
          setDragInvalid(false);
        }
        return;
      }

      const tStartMs = resolveDropStartMs(translated.top, over.rect.top, zone.msPerPx);
      const currentItem = activeItemRef.current;

      let isValid = true;
      if (currentItem?.type === 'new-skill') {
        isValid = canDropNewMitigation(
          currentItem.skill.id,
          tStartMs,
          mitEvents,
          cooldownEvents,
          resolveOwnerContext(currentItem.ownerJob),
        );
      } else if (currentItem?.type === 'existing-mit') {
        const eventsToMove = dragMovingEventsRef.current.length
          ? dragMovingEventsRef.current
          : [currentItem.mit];
        isValid = canDropExistingMitigations({
          sourceMit: currentItem.mit,
          tStartMs,
          eventsToMove,
          mitEvents,
        });
      }

      if (dragInvalidRef.current === !isValid) return;
      dragInvalidRef.current = !isValid;
      setDragInvalid(!isValid);
    },
    [cooldownEvents, mitEvents, resolveOwnerContext],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      const item = active.data.current as DragItemData | undefined;
      const translated = active.rect.current?.translated;

      resetDragSession();

      if (!over || !item || !translated) return;

      const zone = over.data.current as DropZoneData | undefined;
      if (!zone) return;

      if (zone.kind === 'trash') {
        if (item.type !== 'existing-mit') return;

        const selectedMitIds = useStore.getState().selectedMitIds;
        const idsToRemove = resolveMitRemovalIds(item.mit, selectedMitIds);
        const removeSet = new Set(idsToRemove);
        setMitEvents(mitEvents.filter((mit) => !removeSet.has(mit.id)));
        setSelectedMitIds([]);
        return;
      }

      if (zone.kind !== 'mit-lane') return;
      const tStartMs = resolveDropStartMs(translated.top, over.rect.top, zone.msPerPx);

      if (item.type === 'new-skill') {
        const ownerContext = resolveOwnerContext(item.ownerJob);
        if (
          !canDropNewMitigation(item.skill.id, tStartMs, mitEvents, cooldownEvents, ownerContext)
        ) {
          push('冷却中，无法放置该技能。', { tone: 'error' });
          return;
        }

        const newMit = buildMitEventFromSkill({
          skillId: item.skill.id,
          tStartMs,
          ownerJob: ownerContext.ownerJob,
          ownerId: ownerContext.ownerId,
        });
        if (!newMit) return;

        addMitEvent(newMit);
        return;
      }

      if (item.type !== 'existing-mit') return;

      const selectedMitIds = useStore.getState().selectedMitIds;
      const dragContext = prepareExistingMitDrag(item.mit, selectedMitIds, mitEvents);
      const movedEvents = buildMovedMitEvents({
        sourceMit: item.mit,
        tStartMs,
        eventsToMove: dragContext.eventsToMove,
        mitEvents,
      });

      if (!movedEvents || movedEvents.length !== dragContext.eventsToMove.length) {
        push('冷却冲突或时间无效，已取消移动。', { tone: 'error' });
        return;
      }

      const movedIds = new Set(movedEvents.map((mit) => mit.id));
      setMitEvents([...movedEvents, ...mitEvents.filter((mit) => !movedIds.has(mit.id))]);
    },
    [
      addMitEvent,
      cooldownEvents,
      mitEvents,
      push,
      resetDragSession,
      resolveOwnerContext,
      setMitEvents,
      setSelectedMitIds,
    ],
  );

  const handleDragCancel = useCallback(() => {
    resetDragSession();
  }, [resetDragSession]);

  return {
    activeItem,
    dragPreviewPx,
    dragInvalid,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    handleDragCancel,
  };
}
