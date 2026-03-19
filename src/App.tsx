import { useEffect, useMemo, useState } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useShallow } from 'zustand/shallow';
import { type Actor, type Job } from './model/types';
import { useStore } from './store';
import { selectAppActions, selectAppState } from './store/selectors';
import { getSkillDefinition } from './data/skills';
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
import { useMitigationDragController } from './hooks/useMitigationDragController';
import { MS_PER_SEC, TIME_DECIMAL_PLACES } from './constants/time';
import { DEFAULT_ZOOM } from './constants/timeline';
import { getStoredTheme, parseFFLogsUrl, setStoredTheme } from './utils';

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
  const [exportCreatedAt, setExportCreatedAt] = useState('');
  const [enableTTS, setEnableTTS] = useState(false);
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

  const buildExportContent = (
    eventsToExport: ReturnType<typeof getEventsToExport>,
    ttsEnabled: boolean,
    createdAt: string,
  ) => {
    const timeline = FFLogsExporter.generateTimeline(eventsToExport, ttsEnabled);
    const parsed = parseFFLogsUrl(fflogsUrl);
    const source =
      parsed?.reportCode && fight ? `${parsed.reportCode}?fight=${fight.id}` : '来自XMC';

    const rawJobs =
      loadMode === 'dual'
        ? dualTankPlayers.filter((player) => player.id).map((player) => player.job)
        : selectedJob
          ? [selectedJob]
          : [];
    const jobs = Array.from(new Set(rawJobs));

    const condition: { zoneID?: string; jobs: string[]; fflogsBoss?: number } = {
      jobs,
    };
    if (fight?.zoneID !== undefined) {
      condition.zoneID = String(fight.zoneID);
    }
    if (fight?.fflogsBoss !== undefined) {
      condition.fflogsBoss = fight.fflogsBoss;
    }

    const payload = {
      name: fight?.name ?? '时间轴',
      condition,
      timeline,
      source,
      createdAt,
    };

    return JSON.stringify(payload, null, 2);
  };

  const handleExportTimeline = () => {
    const eventsToExport = getEventsToExport();
    const createdAt = new Date().toLocaleString();
    setExportCreatedAt(createdAt);
    const content = buildExportContent(eventsToExport, enableTTS, createdAt);
    setExportContent(content);
    setIsExportModalOpen(true);
  };

  const handleTtsChange = (enabled: boolean) => {
    setEnableTTS(enabled);
    const eventsToExport = getEventsToExport();
    const content = buildExportContent(eventsToExport, enabled, exportCreatedAt);
    setExportContent(content);
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

  const {
    activeItem,
    dragPreviewPx,
    dragInvalid,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    handleDragCancel,
  } = useMitigationDragController({
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
  });

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
      onDragCancel={handleDragCancel}
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
