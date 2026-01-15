import { useEffect, useState } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import type { MitEvent, Skill } from './model/types';
import { useStore } from './store';
import { SKILLS } from './data/skills';
import { FFLogsExporter } from './lib/fflogs/exporter';
import { parseFFLogsUrl } from './utils';
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
    error
  } = useStore();

  const [fflogsUrl, setFflogsUrl] = useState('');
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportContent, setExportContent] = useState('');
  const [activeItem, setActiveItem] = useState<DragOverlayItem | null>(null);
  const [dragDeltaMs, setDragDeltaMs] = useState(0);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5
      }
    })
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

  const handleExportTimeline = () => {
    const { castEvents, mitEvents } = useStore.getState();
    const eventsToExport = [
      ...castEvents.map(e => ({
        time: Number((e.tMs / MS_PER_SEC).toFixed(TIME_DECIMAL_PLACES)),
        actionName: e.ability.name,
        actionId: e.originalActionId || e.ability.guid,
        type: e.originalType || e.type,
        isFriendly: !!e.isFriendly,
        sourceId: e.sourceID
      })),
      ...mitEvents.map(m => {
        const skill = SKILLS.find(s => s.id === m.skillId);
        return {
          time: Number((m.tStartMs / MS_PER_SEC).toFixed(TIME_DECIMAL_PLACES)),
          actionName: skill?.name || 'Unknown',
          actionId: skill?.actionId || 0,
          type: 'cast',
          isFriendly: true,
          sourceId: selectedPlayerId || 0
        };
      })
    ].sort((a, b) => a.time - b.time);

    const txt = FFLogsExporter.generateTimeline(eventsToExport);
    setExportContent(txt);
    setIsExportModalOpen(true);
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
    setDragDeltaMs(pixelsToMs(delta.x));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveItem(null);
    setDragDeltaMs(0);
    const { active, over } = event;
    if (!over) return;

    if (over.id === 'mit-lane') {
      const type = active.data.current?.type;
      const laneEl = document.getElementById('mit-lane-container');

      if (laneEl) {
        const rect = laneEl.getBoundingClientRect();
        const initial = active.rect.current?.initial;

        let offsetX = 0;

        if (initial) {
          const translated = active.rect.current?.translated;
          if (translated) {
            offsetX = translated.left - rect.left;
          }
        }

        if (offsetX < 0) offsetX = 0;

        const tStartMs = pixelsToMs(offsetX);

        let skillId: string;
        let selfId: string | null = null;

        if (type === 'new-skill') {
          skillId = (active.data.current?.skill as Skill).id;
        } else {
          const mit = active.data.current?.mit as MitEvent;
          skillId = mit.skillId;
          selfId = mit.id;
        }

        const checkConflict = (checkSkillId: string, checkStartMs: number, checkSelfId: string | null, customEvents?: MitEvent[]) => {
          const eventsToCheck = customEvents || mitEvents;
          const skillDef = SKILLS.find(s => s.id === checkSkillId);
          if (!skillDef) return false;
          const cdMs = skillDef.cooldownSec * MS_PER_SEC;
          return eventsToCheck.some(m => {
            if (m.id === checkSelfId) return false;
            if (m.skillId !== checkSkillId) return false;
            return Math.abs(m.tStartMs - checkStartMs) < cdMs;
          });
        };

        if (checkConflict(skillId, tStartMs, selfId)) {
          console.warn('Skill is on cooldown!');
          return;
        }

        if (type === 'new-skill') {
          const skill = active.data.current?.skill as Skill;
          const newMit: MitEvent = {
            id: crypto.randomUUID(),
            skillId: skill.id,
            tStartMs: tStartMs,
            durationMs: skill.durationSec * MS_PER_SEC,
            tEndMs: tStartMs + (skill.durationSec * MS_PER_SEC)
          };
          addMitEvent(newMit);
        } else if (type === 'existing-mit') {
          const mit = active.data.current?.mit as MitEvent;
          const { selectedMitIds, mitEvents, updateMitEvent } = useStore.getState();

          const deltaMs = pixelsToMs(event.delta.x);

          if (selectedMitIds.includes(mit.id)) {
            let isValid = true;
            for (const id of selectedMitIds) {
              const item = mitEvents.find(m => m.id === id);
              if (!item) continue;
              const newStart = item.tStartMs + deltaMs;
              if (newStart < 0) {
                isValid = false;
                break;
              }

              const conflict = checkConflict(item.skillId, newStart, item.id, mitEvents.filter(m => !selectedMitIds.includes(m.id)));
              if (conflict) {
                isValid = false;
                break;
              }
            }

            if (isValid) {
              selectedMitIds.forEach(id => {
                const item = mitEvents.find(m => m.id === id);
                if (item) {
                  const newStart = item.tStartMs + deltaMs;
                  updateMitEvent(id, {
                    tStartMs: newStart,
                    tEndMs: newStart + item.durationMs
                  });
                }
              });
            }
          } else {
            const newStart = mit.tStartMs + deltaMs;
            const clampedStart = Math.max(0, newStart);

            if (checkConflict(mit.skillId, clampedStart, mit.id, mitEvents)) {
              console.warn('Skill is on cooldown (single drag)!');
              return;
            }

            updateMitEvent(mit.id, {
              tStartMs: clampedStart,
              tEndMs: clampedStart + mit.durationMs
            });
          }
        }
      }
    }
  };

  const isReady = !!(fight && selectedJob && selectedPlayerId);

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd}>
      <div className="min-h-screen bg-gray-900 text-white flex flex-col font-sans">
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

        <div className="flex-1 flex overflow-hidden max-h-full">
          <EmptyState hasFight={!!fight} hasSelection={isReady} />

          {isReady && selectedJob && (
            <>
              <SkillSidebar selectedJob={selectedJob} />
              <div className="flex-1 bg-gray-950 relative overflow-hidden flex flex-col">
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
      />
    </DndContext>
  );
}
