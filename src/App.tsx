import { useEffect, useState } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { type MitEvent, type Skill } from './model/types';
import { useStore } from './store';
import { SKILLS } from './data/skills';
import { FFLogsExporter } from './lib/fflogs/exporter';
import { AppHeader } from './components/AppHeader';
import { DragOverlayLayer, type DragOverlayItem } from './components/DragOverlayLayer';
import { EmptyState } from './components/EmptyState';
import { ExportModal } from './components/ExportModal';
import { FightInfoBar } from './components/FightInfoBar';
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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
  );

  useEffect(() => {
    if (fight && selectedPlayerId) {
      loadEvents();
    }
  }, [fight, selectedPlayerId, loadEvents]);

  const pixelsToMs = (pixels: number) => (pixels / zoom) * MS_PER_SEC;

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
          sourceId: selectedPlayerId || 0,
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
  ): MitEvent | null => {
    const skillDef = SKILLS.find((s) => s.id === skillId);
    if (!skillDef) return null;
    const durationMs = skillDef.durationSec * MS_PER_SEC;
    return {
      eventType: 'mit',
      id,
      skillId,
      tStartMs,
      durationMs,
      tEndMs: tStartMs + durationMs,
    };
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
      const newMit = buildMitEventFromSkill(skill.id, tStartMs);
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

      const movedEvents = eventsToMove
        .map((m) => {
          const newStart = m.tStartMs + deltaMs;
          if (newStart < 0) return;

          return {
            ...m,
            tStartMs: newStart,
            tEndMs: newStart + m.durationMs,
          };
        })
        .filter((m) => m !== undefined);

      const movedIds = movedEvents.map((m) => m.id);
      setMitEvents([...movedEvents, ...mitEvents.filter((m) => !movedIds.includes(m.id))]);
    }
  };

  const isReady = !!(fight && selectedJob && selectedPlayerId);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
      <div className="h-screen overflow-hidden bg-gray-900 text-white flex flex-col font-sans">
        <AppHeader
          apiKey={apiKey}
          fflogsUrl={fflogsUrl}
          isLoading={isLoading}
          canExport={!!fight && castEvents.length > 0}
          error={error}
          onApiKeyChange={setApiKey}
          onFflogsUrlChange={setFflogsUrl}
          onLoadFight={loadFightMetadata}
          onExportTimeline={handleExportTimeline}
        />

        {fight && (
          <FightInfoBar
            fight={fight}
            actors={actors}
            selectedJob={selectedJob}
            selectedPlayerId={selectedPlayerId}
            onSelectJob={setSelectedJob}
            onSelectPlayer={setSelectedPlayerId}
          />
        )}

        <div className="flex-1 min-h-0 flex overflow-hidden">
          <EmptyState hasFight={!!fight} hasSelection={isReady} />

          {isReady && selectedJob && (
            <>
              <SkillSidebar selectedJob={selectedJob} />
              <div className="flex-1 min-h-0 bg-gray-950 relative overflow-hidden flex flex-col">
                <Timeline
                  zoom={zoom}
                  setZoom={setZoom}
                  activeDragId={activeItem?.type === 'existing-mit' ? activeItem.mit.id : null}
                  dragDeltaMs={dragDeltaMs}
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
    </DndContext>
  );
}
