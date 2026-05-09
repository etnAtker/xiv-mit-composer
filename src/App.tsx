import { useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useShallow } from 'zustand/shallow';
import { useStore } from './store';
import { selectAppActions, selectAppState } from './store/selectors';
import { getSkillDefinition } from './data/skills';
import { FFLogsExporter } from './lib/fflogs/exporter';
import { AppHeader } from './components/AppHeader';
import { DragOverlayLayer } from './components/DragOverlayLayer';
import { EmptyState } from './components/EmptyState';
import { ExportModal } from './components/ExportModal';
import { FightInfoBar } from './components/FightInfoBar';
import { LoadingOverlay } from './components/LoadingOverlay';
import { PartyMemberSelectModal } from './components/PartyMemberSelectModal';
import { ProjectManagerModal } from './components/ProjectManagerModal';
import { SkillSidebar } from './components/SkillSidebar';
import { Timeline } from './components/Timeline/Timeline';
import { TimelineToolbar } from './components/Timeline/TimelineToolbar';
import { TopBannerStack } from './components/TopBanner';
import { TrashDropZone } from './components/TrashDropZone';
import { useTopBanner } from './hooks/useTopBanner';
import { useMitigationDragController } from './hooks/useMitigationDragController';
import { MS_PER_SEC, TIME_DECIMAL_PLACES } from './constants/time';
import { DEFAULT_ZOOM } from './constants/timeline';
import { decodeProjectDocument, encodeProjectDocument } from './domain/project/projectCodec';
import { getStoredTheme, parseFFLogsUrl, setStoredTheme } from './utils';
import type { PartyMember } from './model/types';

export default function App() {
  const {
    apiKey,
    fflogsUrl,
    fight,
    actors,
    bossIds,
    selectedJob,
    selectedPlayerId,
    partyMembers,
    damageEventMembers,
    damageEventsByPlayerId,
    mitEvents,
    cooldownEvents,
    castEvents,
    isLoading,
    isRendering,
    projectSlots,
    activeProjectSlotId,
  } = useStore(useShallow(selectAppState));

  const {
    setApiKey,
    setFflogsUrl,
    setSelectedMitIds,
    loadFightMetadata,
    setPartyMembers,
    setAllPartyMembersCollapsed,
    loadEventsForPlayers,
    addMitEvent,
    setMitEvents,
    saveCurrentProjectSlot,
    createProjectSlot,
    duplicateProjectSlot,
    renameProjectSlot,
    deleteProjectSlot,
    switchProjectSlot,
    importProjectDocument,
  } = useStore(useShallow(selectAppActions));

  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportContent, setExportContent] = useState('');
  const [exportCreatedAt, setExportCreatedAt] = useState('');
  const [exportPlayerId, setExportPlayerId] = useState<number | null>(null);
  const [enableTTS, setEnableTTS] = useState(false);
  const [isPartyModalOpen, setIsPartyModalOpen] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [projectExportContent, setProjectExportContent] = useState('');
  const [isProjectBusy, setIsProjectBusy] = useState(false);
  const hasRestoredActiveSlot = useRef(false);
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

  useEffect(() => {
    if (hasRestoredActiveSlot.current || !activeProjectSlotId) return;
    hasRestoredActiveSlot.current = true;
    try {
      const document = switchProjectSlot(activeProjectSlotId);
      if (document) {
        setZoom(document.ui.zoom);
      }
    } catch (error) {
      console.error(error);
      push('当前槽位存在冷却冲突，已保留历史状态', { tone: 'error' });
    }
  }, [activeProjectSlotId, push, switchProjectSlot]);

  useEffect(() => {
    if (!activeProjectSlotId) return;
    const timer = window.setTimeout(() => {
      saveCurrentProjectSlot(zoom);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [
    activeProjectSlotId,
    fflogsUrl,
    fight,
    actors,
    bossIds,
    selectedJob,
    selectedPlayerId,
    partyMembers,
    damageEventMembers,
    damageEventsByPlayerId,
    castEvents,
    mitEvents,
    zoom,
    saveCurrentProjectSlot,
  ]);

  const sensorOptions = useMemo(
    () => ({
      activationConstraint: {
        distance: 5,
      },
    }),
    [],
  );
  const sensors = useSensors(useSensor(PointerSensor, sensorOptions));

  const getEventsToExport = (playerId: number) => {
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
      ...mitEvents
        .filter((m) => m.ownerId === playerId)
        .map((m) => {
          const skill = getSkillDefinition(m.skillId);
          return {
            time: Number((m.tStartMs / MS_PER_SEC).toFixed(TIME_DECIMAL_PLACES)),
            actionName: skill?.name || 'Unknown',
            actionId: skill?.actionId || 0,
            type: 'cast',
            isFriendly: true,
            sourceId: m.ownerId ?? playerId,
          };
        }),
    ].sort((a, b) => a.time - b.time);
  };

  const buildExportContent = (
    eventsToExport: ReturnType<typeof getEventsToExport>,
    ttsEnabled: boolean,
    createdAt: string,
    playerId: number,
  ) => {
    const timeline = FFLogsExporter.generateTimeline(eventsToExport, ttsEnabled);
    const parsed = parseFFLogsUrl(fflogsUrl);
    const source =
      parsed?.reportCode && fight ? `${parsed.reportCode}?fight=${fight.id}` : '来自XMC';
    const selectedMember = partyMembers.find((member) => member.playerId === playerId);
    const jobs = selectedMember
      ? [selectedMember.job]
      : Array.from(new Set(partyMembers.map((member) => member.job)));

    const condition: { zoneID?: string; jobs: string[]; fflogsBoss?: number } = {
      jobs,
    };
    if (fight?.zoneID !== undefined) {
      condition.zoneID = String(fight.zoneID);
    }
    if (fight?.fflogsBoss !== undefined) {
      condition.fflogsBoss = fight.fflogsBoss;
    }

    return JSON.stringify(
      {
        name: fight?.name ?? '时间轴',
        condition,
        timeline,
        source,
        createdAt,
      },
      null,
      2,
    );
  };

  const handleExportTimeline = () => {
    const playerId =
      partyMembers.find((member) => member.playerId === selectedPlayerId)?.playerId ??
      partyMembers[0]?.playerId;

    if (playerId === undefined) {
      push('请先选择队伍成员后再导出', { tone: 'warning' });
      return;
    }

    const eventsToExport = getEventsToExport(playerId);
    const createdAt = new Date().toLocaleString();
    setExportCreatedAt(createdAt);
    setExportPlayerId(playerId);
    setExportContent(buildExportContent(eventsToExport, enableTTS, createdAt, playerId));
    setIsExportModalOpen(true);
  };

  const handleTtsChange = (enabled: boolean) => {
    setEnableTTS(enabled);
    if (exportPlayerId !== null) {
      setExportContent(
        buildExportContent(
          getEventsToExport(exportPlayerId),
          enabled,
          exportCreatedAt,
          exportPlayerId,
        ),
      );
    }
  };

  const handleExportPlayerChange = (playerId: number) => {
    setExportPlayerId(playerId);
    setExportContent(
      buildExportContent(getEventsToExport(playerId), enableTTS, exportCreatedAt, playerId),
    );
  };

  const handleLoadFight = async () => {
    await loadFightMetadata();
    const { fight: latestFight } = useStore.getState();
    if (latestFight) {
      setIsPartyModalOpen(true);
    }
  };

  const handleGenerateProjectExport = async () => {
    setIsProjectBusy(true);
    try {
      saveCurrentProjectSlot(zoom);
      const latest = useStore.getState();
      const activeSlot =
        latest.projectSlots.find((slot) => slot.id === latest.activeProjectSlotId) ??
        latest.projectSlots[0];
      if (!activeSlot) {
        push('没有可导出的工程槽位', { tone: 'warning' });
        return;
      }

      const content = await encodeProjectDocument(activeSlot.document);
      setProjectExportContent(content);
      push('工程导出内容已生成');
    } catch (error) {
      console.error(error);
      push(error instanceof Error ? error.message : '工程导出失败', { tone: 'error' });
    } finally {
      setIsProjectBusy(false);
    }
  };

  const handleImportProject = async (content: string) => {
    setIsProjectBusy(true);
    try {
      const document = await decodeProjectDocument(content);
      const slot = importProjectDocument(document);
      setZoom(slot.document.ui.zoom);
      setProjectExportContent('');
      push(`已导入工程「${slot.name}」`);
    } catch (error) {
      console.error(error);
      push(error instanceof Error ? error.message : '工程导入失败', { tone: 'error' });
    } finally {
      setIsProjectBusy(false);
    }
  };

  const handleSwitchProjectSlot = (id: string) => {
    try {
      saveCurrentProjectSlot(zoom);
      const document = switchProjectSlot(id);
      if (!document) return;
      setZoom(document.ui.zoom);
      setProjectExportContent('');
      const slot = useStore.getState().projectSlots.find((item) => item.id === id);
      push(`已切换到「${slot?.name ?? '工程槽位'}」`);
    } catch (error) {
      console.error(error);
      push(error instanceof Error ? error.message : '槽位切换失败', { tone: 'error' });
    }
  };

  const handleCreateProjectSlot = (name: string) => {
    const slot = createProjectSlot(name, zoom);
    setProjectExportContent('');
    push(`已创建槽位「${slot.name}」`);
  };

  const handleDuplicateProjectSlot = (name: string) => {
    try {
      saveCurrentProjectSlot(zoom);
      const slot = duplicateProjectSlot(name);
      setZoom(slot.document.ui.zoom);
      setProjectExportContent('');
      push(`已复制为「${slot.name}」`);
    } catch (error) {
      console.error(error);
      push(error instanceof Error ? error.message : '复制槽位失败', { tone: 'error' });
    }
  };

  const handleDeleteProjectSlot = (id: string) => {
    try {
      const document = deleteProjectSlot(id);
      if (document) setZoom(document.ui.zoom);
      setProjectExportContent('');
      push('槽位已删除');
    } catch (error) {
      console.error(error);
      push(error instanceof Error ? error.message : '删除槽位失败', { tone: 'error' });
    }
  };

  const handleConfirmPartyMembers = async (members: PartyMember[]) => {
    setIsPartyModalOpen(false);
    setPartyMembers(members);
    await loadEventsForPlayers(members);
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
    partyMembers,
    mitEvents,
    cooldownEvents,
    addMitEvent,
    setMitEvents,
    setSelectedMitIds,
    push,
  });

  const isReady = !!(fight && partyMembers.length > 0);

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
          onLoadFight={handleLoadFight}
          onExportTimeline={handleExportTimeline}
          onOpenProjectManager={() => setIsProjectModalOpen(true)}
          onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        />

        {fight && (
          <FightInfoBar
            fight={fight}
            partyMembers={partyMembers}
            onEditParty={() => setIsPartyModalOpen(true)}
            onExpandAll={() => setAllPartyMembersCollapsed(false)}
            onCollapseAll={() => setAllPartyMembersCollapsed(true)}
          />
        )}

        <div className="flex-1 min-h-0 flex overflow-hidden">
          <EmptyState hasFight={!!fight} hasSelection={isReady} />

          {isReady && (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="flex border-b border-app bg-surface-2 text-app">
                <div className="w-64 border-r border-app bg-surface-2 p-4">
                  <h3 className="font-bold text-muted text-sm uppercase tracking-wide">可用技能</h3>
                </div>
                <TimelineToolbar zoom={zoom} setZoom={setZoom} onClear={() => setMitEvents([])} />
              </div>

              <div className="flex min-h-0 flex-1 overflow-hidden">
                <SkillSidebar partyMembers={partyMembers} />
                <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-app text-app">
                  <Timeline
                    zoom={zoom}
                    setZoom={setZoom}
                    activeDragId={activeItem?.type === 'existing-mit' ? activeItem.mit.id : null}
                    dragPreviewPx={dragPreviewPx}
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
        partyMembers={partyMembers}
        selectedPlayerId={exportPlayerId}
        enableTTS={enableTTS}
        onPlayerChange={handleExportPlayerChange}
        onTtsChange={handleTtsChange}
      />

      <ProjectManagerModal
        isOpen={isProjectModalOpen}
        isBusy={isProjectBusy}
        slots={projectSlots}
        activeSlotId={activeProjectSlotId}
        exportContent={projectExportContent}
        onClose={() => setIsProjectModalOpen(false)}
        onGenerateExport={handleGenerateProjectExport}
        onImport={handleImportProject}
        onSwitchSlot={handleSwitchProjectSlot}
        onCreateSlot={handleCreateProjectSlot}
        onDuplicateSlot={handleDuplicateProjectSlot}
        onRenameSlot={renameProjectSlot}
        onDeleteSlot={handleDeleteProjectSlot}
      />

      {isPartyModalOpen && (
        <PartyMemberSelectModal
          isOpen
          actors={actors}
          initialMembers={partyMembers}
          onConfirm={handleConfirmPartyMembers}
          onClose={() => setIsPartyModalOpen(false)}
        />
      )}

      <TopBannerStack />
    </DndContext>
  );
}
