import { useEffect, useMemo, useState } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { type Actor, type Job, type MitEvent, type Skill } from './model/types';
import { useStore } from './store';
import { SKILLS } from './data/skills';
import { FFLogsExporter } from './lib/fflogs/exporter';
import { AppHeader } from './components/AppHeader';
import { DragOverlayLayer, type DragOverlayItem } from './components/DragOverlayLayer';
import { EmptyState } from './components/EmptyState';
import { ExportModal } from './components/ExportModal';
import { FightInfoBar } from './components/FightInfoBar';
import { LoadFightModal } from './components/LoadFightModal';
import { LoadingOverlay } from './components/LoadingOverlay';
import { SkillSidebar } from './components/SkillSidebar';
import { Timeline } from './components/Timeline/Timeline';
import { MS_PER_SEC, TIME_DECIMAL_PLACES } from './constants/time';
import { DEFAULT_ZOOM } from './constants/timeline';

export default function App() {
  const {
    apiKey,
    fflogsUrl,
    setApiKey,
    setFflogsUrl,
    setSelectedMitIds,
    loadFightMetadata,
    fight,
    actors,
    selectedJob,
    setSelectedJob,
    selectedPlayerId,
    setSelectedPlayerId,
    loadEvents,
    loadEventsForPlayers,
    mitEvents,
    addMitEvent,
    setMitEvents,
    castEvents,
    isLoading,
    isRendering,
    error,
  } = useStore();

  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportContent, setExportContent] = useState('');
  const [enableTTS, setEnableTTS] = useState(false);
  const [activeItem, setActiveItem] = useState<DragOverlayItem | null>(null);
  const [dragDeltaMs, setDragDeltaMs] = useState(0);
  const [isLoadModalOpen, setIsLoadModalOpen] = useState(false);
  const [loadMode, setLoadMode] = useState<'single' | 'dual'>('single');
  const [dualTankPlayers, setDualTankPlayers] = useState<{ id: number | null; job: Job }[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'dark';
    const stored = window.localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    window.localStorage.setItem('theme', theme);
  }, [theme]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
  );

  const TANK_JOB_MAP: Record<Job, string[]> = {
    PLD: ['Paladin'],
    WAR: ['Warrior'],
    DRK: ['DarkKnight', 'Dark Knight'],
    GNB: ['Gunbreaker'],
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

  const pixelsToMs = (pixels: number) => (pixels / zoom) * MS_PER_SEC;
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
        const skill = SKILLS.find((s) => s.id === m.skillId);
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
    const primary = dualTankPlayers.find(
      (player): player is { id: number; job: Job } => typeof player.id === 'number',
    );
    if (!primary) return;
    if (selectedJob !== primary.job) {
      setSelectedJob(primary.job);
    }
    if (selectedPlayerId !== primary.id) {
      setSelectedPlayerId(primary.id);
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
    const currentItem = event.active.data.current as DragOverlayItem;
    setActiveItem(currentItem);
    if (currentItem?.type === 'new-skill') {
      setSelectedMitIds([]);
    }
    setDragDeltaMs(0);
  };

  const handleDragMove = (event: DragEndEvent) => {
    const { delta } = event;
    setDragDeltaMs(pixelsToMs(delta.y));
  };

  const getDropStartMs = (event: DragEndEvent) => {
    const laneEl = document.getElementById('mit-lane-container');
    if (!laneEl) return null;

    const rect = laneEl.getBoundingClientRect();
    const initial = event.active.rect.current?.initial;
    const translated = event.active.rect.current?.translated;

    if (!initial || !translated) return null;

    const offsetY = Math.max(0, translated.top - rect.top);
    return pixelsToMs(offsetY);
  };

  const buildMitEventFromSkill = (
    skillId: string,
    tStartMs: number,
    id = crypto.randomUUID(),
    ownerJob?: Job,
    ownerId?: number,
  ): MitEvent | null => {
    const skillDef = SKILLS.find((s) => s.id === skillId);
    if (!skillDef) return null;
    const durationMs = skillDef.durationSec * MS_PER_SEC;
    const resolvedOwner = resolveOwnerContext(ownerJob);
    return {
      eventType: 'mit',
      id,
      skillId,
      tStartMs,
      durationMs,
      tEndMs: tStartMs + durationMs,
      ownerId: ownerId ?? resolvedOwner.ownerId,
      ownerJob: resolvedOwner.ownerJob,
    };
  };

  const isInCooldownShadow = (
    skillId: string,
    startMs: number,
    excludeIds: Set<string>,
    allEvents: MitEvent[],
    ownerJob?: Job,
    ownerId?: number,
  ) => {
    const skillDef = SKILLS.find((s) => s.id === skillId);
    if (!skillDef) return false;
    const cooldownMs = skillDef.cooldownSec * MS_PER_SEC;

    return allEvents.some((event) => {
      if (excludeIds.has(event.id)) return false;
      if (event.skillId !== skillId) return false;
      if (ownerId && event.ownerId && event.ownerId !== ownerId) return false;
      if (!ownerId && ownerJob && event.ownerJob && event.ownerJob !== ownerJob) return false;

      const effectEnd = event.tStartMs + event.durationMs;
      const cdEnd = effectEnd + cooldownMs;
      return startMs >= effectEnd && startMs < cdEnd;
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveItem(null);
    setDragDeltaMs(0);
    const { active, over } = event;
    if (!over) return;

    if (over.id !== 'mit-lane') {
      return;
    }

    const type = active.data.current?.type;
    const tStartMs = getDropStartMs(event);
    if (tStartMs === null) return;

    if (type === 'new-skill') {
      const skill = active.data.current?.skill as Skill;
      const { ownerJob, ownerId } = resolveOwnerContext(active.data.current?.ownerJob);
      if (isInCooldownShadow(skill.id, tStartMs, new Set(), mitEvents, ownerJob, ownerId)) {
        return;
      }
      const newMit = buildMitEventFromSkill(skill.id, tStartMs, undefined, ownerJob, ownerId);
      if (!newMit) return;

      addMitEvent(newMit);
    } else if (type === 'existing-mit') {
      const mit = active.data.current?.mit as MitEvent;
      const deltaMs = pixelsToMs(event.delta.y);
      let eventsToMove: MitEvent[] = [];

      const selectedMitIds = useStore.getState().selectedMitIds;
      if (selectedMitIds.includes(mit.id)) {
        eventsToMove = mitEvents.filter((m) => selectedMitIds.includes(m.id));
      } else {
        eventsToMove = [mit];
      }

      const movingIds = new Set(eventsToMove.map((m) => m.id));
      const movedEvents = eventsToMove
        .map((m) => {
          const newStart = m.tStartMs + deltaMs;
          if (newStart < 0) return;
          if (
            isInCooldownShadow(
              m.skillId,
              newStart,
              movingIds,
              mitEvents,
              m.ownerJob ?? undefined,
              m.ownerId ?? undefined,
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
        return;
      }

      const movedIds = movedEvents.map((m) => m.id);
      setMitEvents([...movedEvents, ...mitEvents.filter((m) => !movedIds.includes(m.id))]);
    }
  };

  const selectedJobs =
    loadMode === 'dual' ? Array.from(new Set(dualTankPlayers.map((p) => p.job))) : null;
  const dualPlayerMap = useMemo(() => {
    const map: Record<Job, number | null> = { PLD: null, WAR: null, DRK: null, GNB: null };
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
    >
      <div className="h-screen overflow-hidden bg-app text-app flex flex-col font-sans">
        <AppHeader
          apiKey={apiKey}
          fflogsUrl={fflogsUrl}
          isLoading={isLoading}
          canExport={!!fight && castEvents.length > 0}
          error={error}
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
            <>
              <SkillSidebar
                selectedJob={(selectedJob ?? selectedJobs?.[0]) as Job}
                selectedJobs={selectedJobs && selectedJobs.length ? selectedJobs : undefined}
              />
              <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-app text-app">
                <Timeline
                  zoom={zoom}
                  setZoom={setZoom}
                  activeDragId={activeItem?.type === 'existing-mit' ? activeItem.mit.id : null}
                  dragDeltaMs={dragDeltaMs}
                  selectedJobs={selectedJobs ?? undefined}
                />
              </div>
            </>
          )}

          <LoadingOverlay isLoading={isLoading} isRendering={isRendering} />
        </div>
      </div>

      <DragOverlayLayer activeItem={activeItem} zoom={zoom} />

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
    </DndContext>
  );
}
