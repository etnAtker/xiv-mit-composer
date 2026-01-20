import { useEffect, useState } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import type { MitEvent, Skill } from './model/types';
import { useStore } from './store';
import { SKILLS } from './data/skills';
import { FFLogsExporter } from './lib/fflogs/exporter';
import { parseFFLogsUrl } from './utils';
import { adjustEvents } from './utils/playerCast';
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
    reportCode,
    setApiKey,
    setReportCode,
    setFightId,
    setSelectedMitIds,
    loadFightMetadata,
    fight,
    actors,
    selectedJob,
    setSelectedJob,
    selectedPlayerId,
    setSelectedPlayerId,
    loadEvents,
    addMitEvent,
    mitEvents,
    castEvents,
    isLoading,
    isRendering,
    error,
  } = useStore();

  const [fflogsUrl, setFflogsUrl] = useState('');
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

  const handleFflogsUrlChange = (value: string) => {
    setFflogsUrl(value);
    const parsed = parseFFLogsUrl(value);
    if (parsed) {
      setReportCode(parsed.reportCode);
      setFightId(parsed.fightId);
    }
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

  const checkConflictWithAdjust = (eventsToAdjust: MitEvent[], baseEvents: MitEvent[]) => {
    const excludeIds = new Set(eventsToAdjust.map((e) => e.id));
    const filteredBase = baseEvents.filter((e) => !excludeIds.has(e.id));
    return adjustEvents(eventsToAdjust, filteredBase) === undefined;
  };

  const applyMovedEvents = (movedEvents: MitEvent[]) => {
    const { updateMitEvent } = useStore.getState();
    movedEvents.forEach((item) => {
      updateMitEvent(item.id, {
        tStartMs: item.tStartMs,
        tEndMs: item.tEndMs,
      });
    });
  };

  const handleExistingMitMove = (event: DragEndEvent, mit: MitEvent) => {
    const { selectedMitIds, mitEvents } = useStore.getState();
    const deltaMs = pixelsToMs(event.delta.y);

    if (selectedMitIds.includes(mit.id)) {
      const movedEvents: MitEvent[] = [];
      for (const id of selectedMitIds) {
        const item = mitEvents.find((m) => m.id === id);
        if (!item) continue;
        const newStart = item.tStartMs + deltaMs;
        if (newStart < 0) return;
        movedEvents.push({
          ...item,
          tStartMs: newStart,
          tEndMs: newStart + item.durationMs,
        });
      }

      const baseEvents = mitEvents.filter((m) => !selectedMitIds.includes(m.id));
      if (checkConflictWithAdjust(movedEvents, baseEvents)) return;
      applyMovedEvents(movedEvents);
      return;
    }

    const clampedStart = Math.max(0, mit.tStartMs + deltaMs);
    const updatedMit: MitEvent = {
      ...mit,
      tStartMs: clampedStart,
      tEndMs: clampedStart + mit.durationMs,
    };

    if (checkConflictWithAdjust([updatedMit], mitEvents)) {
      return;
    }

    applyMovedEvents([updatedMit]);
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
      if (checkConflictWithAdjust([newMit], mitEvents)) {
        return;
      }
      addMitEvent(newMit);
    } else if (type === 'existing-mit') {
      const mit = active.data.current?.mit as MitEvent;
      handleExistingMitMove(event, mit);
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
          canLoad={!!apiKey && !!reportCode}
          canExport={!!fight && castEvents.length > 0}
          error={error}
          onApiKeyChange={setApiKey}
          onFflogsUrlChange={handleFflogsUrlChange}
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
