import { useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { useShallow } from 'zustand/shallow';
import { type Actor, type CooldownEvent, type Job, type MitEvent } from './model/types';
import { useStore } from './store';
import { selectAppActions, selectAppState } from './store/selectors';
import { getSkillDefinition, withOwnerSkillId } from './data/skills';
import { FFLogsExporter } from './lib/fflogs/exporter';
import { AppHeader } from './components/AppHeader';
import { DragOverlayLayer } from './components/DragOverlayLayer';
import { EmptyState } from './components/EmptyState';
import { ExportModal } from './components/ExportModal';
import { FightInfoBar } from './components/FightInfoBar';
import { LoadFightModal } from './components/LoadFightModal';
import { LoadingOverlay } from './components/LoadingOverlay';
import { SkillSidebar } from './components/SkillSidebar';
import { Timeline } from './components/Timeline/Timeline';
import { TimelineToolbar } from './components/Timeline/TimelineToolbar';
import { TopBannerStack } from './components/TopBanner';
import { TrashDropZone } from './components/TrashDropZone';
import { useTopBanner } from './hooks/useTopBanner';
import { MS_PER_SEC, TIME_DECIMAL_PLACES } from './constants/time';
import { DEFAULT_ZOOM } from './constants/timeline';
import { canInsertMitigation, tryBuildCooldowns } from './utils/playerCast';
import { getStoredTheme, setStoredTheme } from './utils';
import type { DragItemData, DropZoneData } from './dnd/types';

export default function App() {
  const {
    apiKey,
    fflogsUrl,
    fight,
    actors,
    selectedJob,
    selectedPlayerId,
    mitEvents,
    cooldownEvents,
    castEvents,
    isLoading,
    isRendering,
  } = useStore(useShallow(selectAppState));

  const {
    setApiKey,
    setFflogsUrl,
    setSelectedMitIds,
    loadFightMetadata,
    setSelectedJob,
    setSelectedPlayerId,
    loadEvents,
    loadEventsForPlayers,
    addMitEvent,
    setMitEvents,
  } = useStore(useShallow(selectAppActions));

  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportContent, setExportContent] = useState('');
  const [enableTTS, setEnableTTS] = useState(false);
  const [activeItem, setActiveItem] = useState<DragItemData | null>(null);
  const [dragPreviewPx, setDragPreviewPx] = useState(0);
  const [dragInvalid, setDragInvalid] = useState(false);
  const dragPreviewRef = useRef(0);
  const dragPreviewRafRef = useRef<number | null>(null);
  const dragInvalidRef = useRef(false);
  const dragMovingEventsRef = useRef<MitEvent[]>([]);
  const dragCooldownEventsRef = useRef<CooldownEvent[]>([]);
  const [isLoadModalOpen, setIsLoadModalOpen] = useState(false);
  const [loadMode, setLoadMode] = useState<'single' | 'dual'>('single');
  const [dualTankPlayers, setDualTankPlayers] = useState<{ id: number | null; job: Job }[]>([]);
  const { push } = useTopBanner();
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'dark';
    const stored = getStoredTheme();
    if (stored) return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    setStoredTheme(theme);
  }, [theme]);

  const sensorOptions = useMemo(
    () => ({
      activationConstraint: {
        distance: 5,
      },
    }),
    [],
  );
  const sensors = useSensors(useSensor(PointerSensor, sensorOptions));

  const TANK_JOB_MAP: Record<Job, string[]> = {
    PLD: ['Paladin'],
    WAR: ['Warrior'],
    DRK: ['DarkKnight', 'Dark Knight'],
    GNB: ['Gunbreaker'],
    WHM: [],
    SCH: [],
    AST: [],
    SGE: [],
    MNK: [],
    DRG: [],
    NIN: [],
    SAM: [],
    RPR: [],
    VPR: [],
    BRD: [],
    MCH: [],
    DNC: [],
    BLM: [],
    SMN: [],
    RDM: [],
    PCT: [],
  };

  const detectTankPlayers = (list: Actor[]) => {
    const tanks: { id: number; job: Job }[] = [];
    const seenJobs = new Set<Job>();
    list.forEach((actor) => {
      const job = (Object.keys(TANK_JOB_MAP) as Job[]).find(
        (jobKey) =>
          TANK_JOB_MAP[jobKey]?.includes(actor.type) ||
          TANK_JOB_MAP[jobKey]?.includes(actor.subType),
      );
      if (job && !seenJobs.has(job)) {
        tanks.push({ id: actor.id, job });
        seenJobs.add(job);
      }
    });
    return tanks;
  };

  useEffect(() => {
    if (!fight) return;
    if (loadMode === 'dual') {
      const validPlayers = dualTankPlayers.filter(
        (player): player is { id: number; job: Job } => !!player.id,
      );
      if (validPlayers.length) {
        loadEventsForPlayers(validPlayers);
      }
      return;
    }
    if (selectedPlayerId) {
      loadEvents();
    }
  }, [
    fight,
    selectedPlayerId,
    selectedJob,
    loadMode,
    dualTankPlayers,
    loadEvents,
    loadEventsForPlayers,
  ]);

  const resolveOwnerContext = (job?: Job) => {
    const resolvedJob = job ?? selectedJob ?? undefined;
    if (loadMode === 'dual') {
      const match = dualTankPlayers.find((player) => player.job === resolvedJob);
      return { ownerJob: resolvedJob, ownerId: match?.id ?? undefined };
    }
    return { ownerJob: resolvedJob, ownerId: selectedPlayerId ?? undefined };
  };

  const getEventsToExport = () => {
    const { castEvents, mitEvents } = useStore.getState();
    return [
      ...castEvents.map((e) => ({
        time: Number((e.tMs / MS_PER_SEC).toFixed(TIME_DECIMAL_PLACES)),
        actionName: e.ability.name,
        actionId: e.originalActionId || e.ability.guid,
        type: e.originalType || e.type,
        isFriendly: !!e.isFriendly,
        sourceId: e.sourceID,
      })),
      ...mitEvents.map((m) => {
        const skill = getSkillDefinition(m.skillId);
        return {
          time: Number((m.tStartMs / MS_PER_SEC).toFixed(TIME_DECIMAL_PLACES)),
          actionName: skill?.name || 'Unknown',
          actionId: skill?.actionId || 0,
          type: 'cast',
          isFriendly: true,
          sourceId: m.ownerId ?? selectedPlayerId ?? 0,
        };
      }),
    ].sort((a, b) => a.time - b.time);
  };

  const handleExportTimeline = () => {
    const eventsToExport = getEventsToExport();
    const txt = FFLogsExporter.generateTimeline(eventsToExport, enableTTS);
    setExportContent(txt);
    setIsExportModalOpen(true);
  };

  const handleTtsChange = (enabled: boolean) => {
    setEnableTTS(enabled);
    const eventsToExport = getEventsToExport();
    const txt = FFLogsExporter.generateTimeline(eventsToExport, enabled);
    setExportContent(txt);
  };

  const handleOpenLoadModal = () => {
    setIsLoadModalOpen(true);
  };

  const handleConfirmLoadFight = async () => {
    setIsLoadModalOpen(false);
    await loadFightMetadata();

    if (loadMode !== 'dual') {
      setDualTankPlayers([]);
      return;
    }

    const { actors: latestActors } = useStore.getState();
    const tanks = detectTankPlayers(latestActors).slice(0, 2);
    setDualTankPlayers(tanks);
    if (tanks[0]) {
      setSelectedJob(tanks[0].job);
      setSelectedPlayerId(tanks[0].id);
    }
  };

  useEffect(() => {
    if (loadMode !== 'dual') return;
    const primaryJob = dualTankPlayers[0]?.job ?? null;
    const primaryId = primaryJob
      ? (dualTankPlayers.find((player) => player.job === primaryJob)?.id ?? null)
      : null;

    if (selectedJob !== primaryJob) {
      setSelectedJob(primaryJob);
    }
    if (selectedPlayerId !== primaryId) {
      setSelectedPlayerId(primaryId);
    }
  }, [
    dualTankPlayers,
    loadMode,
    selectedJob,
    selectedPlayerId,
    setSelectedJob,
    setSelectedPlayerId,
  ]);

  const handleToggleDualJob = (job: Job) => {
    setDualTankPlayers((prev) => {
      const exists = prev.find((player) => player.job === job);
      if (exists) {
        return prev.filter((player) => player.job !== job);
      }
      if (prev.length >= 2) return prev;
      return [...prev, { job, id: null }];
    });
  };

  const handleSelectDualPlayer = (job: Job, id: number) => {
    setDualTankPlayers((prev) =>
      prev.map((player) => (player.job === job ? { ...player, id } : player)),
    );
  };

  const handleDragStart = (event: DragStartEvent) => {
    const currentItem = event.active.data.current as DragItemData;
    setActiveItem(currentItem);
    if (currentItem?.type === 'new-skill') {
      setSelectedMitIds([]);
    }
    dragInvalidRef.current = false;
    setDragInvalid(false);
    if (currentItem?.type === 'existing-mit') {
      const selectedMitIds = useStore.getState().selectedMitIds;
      const eventsToMove = selectedMitIds.includes(currentItem.mit.id)
        ? mitEvents.filter((m) => selectedMitIds.includes(m.id))
        : [currentItem.mit];
      dragMovingEventsRef.current = eventsToMove;
      const movingIds = new Set(eventsToMove.map((m) => m.id));
      dragCooldownEventsRef.current =
        tryBuildCooldowns(mitEvents.filter((m) => !movingIds.has(m.id))) ?? [];
    } else {
      dragMovingEventsRef.current = [];
      dragCooldownEventsRef.current = [];
    }
    dragPreviewRef.current = 0;
    if (dragPreviewRafRef.current !== null) {
      cancelAnimationFrame(dragPreviewRafRef.current);
      dragPreviewRafRef.current = null;
    }
    setDragPreviewPx(0);
  };

  const handleDragMove = (event: DragEndEvent) => {
    const { delta } = event;
    dragPreviewRef.current = delta.y;
    if (dragPreviewRafRef.current !== null) return;
    dragPreviewRafRef.current = requestAnimationFrame(() => {
      dragPreviewRafRef.current = null;
      setDragPreviewPx(dragPreviewRef.current);
    });

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

    const offsetY = Math.max(0, translated.top - over.rect.top);
    const tStartMs = offsetY * zone.msPerPx;
    let isValid = true;

    if (activeItem?.type === 'new-skill') {
      const { ownerJob, ownerId } = resolveOwnerContext(activeItem.ownerJob);
      isValid = canInsertMitigation(
        activeItem.skill.id,
        tStartMs,
        mitEvents,
        ownerJob,
        ownerId,
        undefined,
        cooldownEvents,
      );
    } else if (activeItem?.type === 'existing-mit') {
      const deltaMs = tStartMs - activeItem.mit.tStartMs;
      const eventsToMove = dragMovingEventsRef.current.length
        ? dragMovingEventsRef.current
        : [activeItem.mit];
      const cooldowns = dragCooldownEventsRef.current;
      isValid = eventsToMove.every((m) => {
        const newStart = m.tStartMs + deltaMs;
        if (newStart < 0) return false;
        return canInsertMitigation(
          m.skillId,
          newStart,
          mitEvents,
          m.ownerJob ?? undefined,
          m.ownerId ?? undefined,
          undefined,
          cooldowns,
        );
      });
    }

    if (dragInvalidRef.current === !isValid) return;
    dragInvalidRef.current = !isValid;
    setDragInvalid(!isValid);
  };

  const buildMitEventFromSkill = (
    skillId: string,
    tStartMs: number,
    id = crypto.randomUUID(),
    ownerJob?: Job,
    ownerId?: number,
  ): MitEvent | null => {
    const skillDef = getSkillDefinition(skillId);
    if (!skillDef) return null;
    const durationMs = skillDef.durationSec * MS_PER_SEC;
    const resolvedOwner = resolveOwnerContext(ownerJob);
    const resolvedSkillId = withOwnerSkillId(skillDef.id, resolvedOwner.ownerJob);
    return {
      eventType: 'mit',
      id,
      skillId: resolvedSkillId,
      tStartMs,
      durationMs,
      tEndMs: tStartMs + durationMs,
      ownerId: ownerId ?? resolvedOwner.ownerId,
      ownerJob: resolvedOwner.ownerJob,
    };
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveItem(null);
    dragInvalidRef.current = false;
    setDragInvalid(false);
    dragMovingEventsRef.current = [];
    dragCooldownEventsRef.current = [];
    dragPreviewRef.current = 0;
    if (dragPreviewRafRef.current !== null) {
      cancelAnimationFrame(dragPreviewRafRef.current);
      dragPreviewRafRef.current = null;
    }
    setDragPreviewPx(0);
    const { active, over } = event;
    if (!over) return;

    // 用 dnd-kit 的 droppable data + 测量信息来路由：不查 DOM id，多实例更安全。
    const zone = over.data.current as DropZoneData | undefined;
    if (!zone) return;
    const item = active.data.current as DragItemData | undefined;
    if (!item) return;

    const translated = active.rect.current?.translated;
    if (!translated) return;

    if (zone.kind === 'trash') {
      if (item.type !== 'existing-mit') return;

      const selectedMitIds = useStore.getState().selectedMitIds;
      const idsToRemove = selectedMitIds.includes(item.mit.id) ? selectedMitIds : [item.mit.id];
      const removeSet = new Set(idsToRemove);
      setMitEvents(mitEvents.filter((m) => !removeSet.has(m.id)));
      setSelectedMitIds([]);
      return;
    }

    if (zone.kind !== 'mit-lane') return;

    const offsetY = Math.max(0, translated.top - over.rect.top);
    const tStartMs = offsetY * zone.msPerPx;

    if (item.type === 'new-skill') {
      const { ownerJob, ownerId } = resolveOwnerContext(item.ownerJob);
      if (
        !canInsertMitigation(
          item.skill.id,
          tStartMs,
          mitEvents,
          ownerJob,
          ownerId,
          undefined,
          cooldownEvents,
        )
      ) {
        push('冷却中，无法放置该技能。', { tone: 'error' });
        return;
      }
      const newMit = buildMitEventFromSkill(item.skill.id, tStartMs, undefined, ownerJob, ownerId);
      if (!newMit) return;
      addMitEvent(newMit);
      return;
    }

    if (item.type !== 'existing-mit') return;

    // 用“绝对落点时间”而不是原始指针 delta (delta) 来算移动量，缩放/测量变化时更稳定。
    const deltaMs = tStartMs - item.mit.tStartMs;
    let eventsToMove: MitEvent[] = [];

    const selectedMitIds = useStore.getState().selectedMitIds;
    if (selectedMitIds.includes(item.mit.id)) {
      eventsToMove = mitEvents.filter((m) => selectedMitIds.includes(m.id));
    } else {
      eventsToMove = [item.mit];
    }

    const movingIds = new Set(eventsToMove.map((m) => m.id));
    const cooldownEventsForMove =
      tryBuildCooldowns(mitEvents.filter((m) => !movingIds.has(m.id))) ?? [];
    const movedEvents = eventsToMove
      .map((m) => {
        const newStart = m.tStartMs + deltaMs;
        if (newStart < 0) return;
        if (
          !canInsertMitigation(
            m.skillId,
            newStart,
            mitEvents,
            m.ownerJob ?? undefined,
            m.ownerId ?? undefined,
            undefined,
            cooldownEventsForMove,
          )
        ) {
          return;
        }

        return {
          ...m,
          tStartMs: newStart,
          tEndMs: newStart + m.durationMs,
        };
      })
      .filter((m) => m !== undefined);

    if (movedEvents.length !== eventsToMove.length) {
      push('冷却冲突或时间无效，已取消移动。', { tone: 'error' });
      return;
    }

    const movedIds = movedEvents.map((m) => m.id);
    setMitEvents([...movedEvents, ...mitEvents.filter((m) => !movedIds.includes(m.id))]);
  };

  const selectedJobs =
    loadMode === 'dual' ? Array.from(new Set(dualTankPlayers.map((p) => p.job))) : null;
  const dualPlayerMap = useMemo(() => {
    const map: Record<Job, number | null> = {
      PLD: null,
      WAR: null,
      DRK: null,
      GNB: null,
      WHM: null,
      SCH: null,
      AST: null,
      SGE: null,
      MNK: null,
      DRG: null,
      NIN: null,
      SAM: null,
      RPR: null,
      VPR: null,
      BRD: null,
      MCH: null,
      DNC: null,
      BLM: null,
      SMN: null,
      RDM: null,
      PCT: null,
    };
    dualTankPlayers.forEach((player) => {
      map[player.job] = player.id ?? null;
    });
    return map;
  }, [dualTankPlayers]);
  const dualReady = dualTankPlayers.some((player) => player.id);
  const isReady = !!(fight && (loadMode === 'dual' ? dualReady : selectedJob && selectedPlayerId));

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        dragPreviewRef.current = 0;
        if (dragPreviewRafRef.current !== null) {
          cancelAnimationFrame(dragPreviewRafRef.current);
          dragPreviewRafRef.current = null;
        }
        dragInvalidRef.current = false;
        setDragInvalid(false);
        dragMovingEventsRef.current = [];
        dragCooldownEventsRef.current = [];
        setDragPreviewPx(0);
      }}
    >
      <div className="h-screen overflow-hidden bg-app text-app flex flex-col font-sans">
        <AppHeader
          apiKey={apiKey}
          fflogsUrl={fflogsUrl}
          isLoading={isLoading}
          canExport={!!fight && castEvents.length > 0}
          theme={theme}
          onApiKeyChange={setApiKey}
          onFflogsUrlChange={setFflogsUrl}
          onLoadFight={handleOpenLoadModal}
          onExportTimeline={handleExportTimeline}
          onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        />

        {fight && (
          <FightInfoBar
            fight={fight}
            actors={actors}
            mode={loadMode}
            selectedJob={selectedJob}
            selectedJobs={selectedJobs ?? []}
            selectedPlayerId={selectedPlayerId}
            selectedPlayersByJob={dualPlayerMap}
            onSelectJob={setSelectedJob}
            onToggleJob={handleToggleDualJob}
            onSelectPlayer={setSelectedPlayerId}
            onSelectPlayerForJob={handleSelectDualPlayer}
          />
        )}

        <div className="flex-1 min-h-0 flex overflow-hidden">
          <EmptyState hasFight={!!fight} hasSelection={isReady} />

          {isReady && (selectedJob || selectedJobs?.length) && (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="flex border-b border-app bg-surface-2 text-app">
                <div className="w-64 border-r border-app bg-surface-2 p-4">
                  <h3 className="font-bold text-muted text-sm uppercase tracking-wide">可用技能</h3>
                </div>
                <TimelineToolbar zoom={zoom} setZoom={setZoom} onClear={() => setMitEvents([])} />
              </div>

              <div className="flex min-h-0 flex-1 overflow-hidden">
                <SkillSidebar
                  selectedJob={(selectedJob ?? selectedJobs?.[0]) as Job}
                  selectedJobs={selectedJobs && selectedJobs.length ? selectedJobs : undefined}
                />
                <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-app text-app">
                  <Timeline
                    zoom={zoom}
                    setZoom={setZoom}
                    activeDragId={activeItem?.type === 'existing-mit' ? activeItem.mit.id : null}
                    dragPreviewPx={dragPreviewPx}
                    selectedJobs={selectedJobs ?? undefined}
                  />
                </div>
              </div>
            </div>
          )}

          <LoadingOverlay isLoading={isLoading} isRendering={isRendering} />
        </div>
      </div>

      <DragOverlayLayer activeItem={activeItem} zoom={zoom} isInvalid={dragInvalid} />
      <TrashDropZone isActive={activeItem?.type === 'existing-mit'} />

      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        content={exportContent}
        enableTTS={enableTTS}
        onTtsChange={handleTtsChange}
      />

      <LoadFightModal
        isOpen={isLoadModalOpen}
        mode={loadMode}
        onModeChange={setLoadMode}
        onConfirm={handleConfirmLoadFight}
        onClose={() => setIsLoadModalOpen(false)}
      />

      <TopBannerStack />
    </DndContext>
  );
}
