import { useEffect, useState } from 'react';
import { useStore } from './store';
import { SKILLS } from './data/skills';
import type { Job, MitEvent, Skill } from './model/types';
import { cn, parseFFLogsUrl } from "./utils";
import { DndContext, useSensor, useSensors, PointerSensor, DragOverlay } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { DraggableSkill } from './components/DraggableSkill';
import { Timeline } from './components/Timeline/Timeline';
import { SkillCard } from './components/SkillCard';
import { MitigationBar } from './components/Timeline/MitigationBar';
import { FFLogsExporter } from './lib/fflogs/exporter';
import { ExportModal } from './components/ExportModal';

type ActiveDragItem =
  | { type: 'new-skill'; skill: Skill }
  | { type: 'existing-mit'; mit: MitEvent }
  | null;

export default function App() {
  const {
    apiKey, reportCode,
    setApiKey, setReportCode, setFightId,
    loadFightMetadata,
    fight, actors,
    selectedJob, setSelectedJob,
    selectedPlayerId, setSelectedPlayerId,
    loadEvents, addMitEvent,
    mitEvents, castEvents,
    isLoading, isRendering, error
  } = useStore();

  const [fflogsUrl, setFflogsUrl] = useState('');

  const [zoom, setZoom] = useState(50);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  // 选中玩家时加载事件
  useEffect(() => {
    if (fight && selectedPlayerId) {
      loadEvents();
    }
  }, [fight, selectedPlayerId, loadEvents]);

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportContent, setExportContent] = useState('');


  const handleExportTimeline = () => {
    const { castEvents, mitEvents } = useStore.getState();
    // 转换 store 中的事件为导出所需格式
    const eventsToExport = [
      ...castEvents.map(e => ({
        time: Number((e.tMs / 1000).toFixed(1)),
        actionName: e.ability.name,
        actionId: e.originalActionId || e.ability.guid,
        type: e.originalType || e.type,
        isFriendly: !!e.isFriendly,
        sourceId: e.sourceID
      })),
      ...mitEvents.map(m => {
        const skill = SKILLS.find(s => s.id === m.skillId);
        return {
          time: Number((m.tStartMs / 1000).toFixed(1)),
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


  // 拖拽覆盖层状态
  const [activeItem, setActiveItem] = useState<ActiveDragItem>(null); // 存储完整的数据对象
  const [dragDeltaMs, setDragDeltaMs] = useState(0);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveItem(event.active.data.current as ActiveDragItem);
    setDragDeltaMs(0);
  };

  const handleDragMove = (event: DragEndEvent) => { // DragMoveEvent is compatible with DragEndEvent structure enough for delta/active
    const { delta } = event;
    // Calculate deltaMs based on current zoom
    const ms = (delta.x / zoom) * 1000;
    setDragDeltaMs(ms);
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
        // 计算相对于泳道起点的偏移量 (t=0)
        // 使用 event.delta + initial 偏移
        const initial = active.rect.current?.initial;

        let offsetX = 0;

        if (initial) {
          // 计算当前拖拽元素的偏移量
          const translated = active.rect.current?.translated;
          if (translated) {
            offsetX = translated.left - rect.left;
          }
        }

        // 安全边界
        if (offsetX < 0) offsetX = 0;


        const tStartMs = (offsetX / zoom) * 1000;

        // --- 技能 CD 校验逻辑 (Simplified for brevity regarding context) ---
        // Note: For multi-item drag, we should validate ALL items.
        // But first, let's keep the single item / new skill logic intact for basic checks.

        let skillId: string;
        let selfId: string | null = null; // 当前拖动事件的ID (如果是新技能则为 null)

        if (type === 'new-skill') {
          skillId = (active.data.current?.skill as Skill).id;
        } else {
          const mit = active.data.current?.mit as MitEvent;
          skillId = mit.skillId;
          selfId = mit.id;
        }

        // ... existing CD check logic ...
        const checkConflict = (checkSkillId: string, checkStartMs: number, checkSelfId: string | null, customEvents?: MitEvent[]) => {
          const eventsToCheck = customEvents || mitEvents;
          const skillDef = SKILLS.find(s => s.id === checkSkillId);
          if (!skillDef) return false;
          const cdMs = skillDef.cooldownSec * 1000;
          return eventsToCheck.some(m => {
            if (m.id === checkSelfId) return false;
            if (m.skillId !== checkSkillId) return false;
            return Math.abs(m.tStartMs - checkStartMs) < cdMs;
          });
        };

        if (checkConflict(skillId, tStartMs, selfId)) {
          console.warn("Skill is on cooldown!");
          return;
        }
        // --- End CD Check ---

        if (type === 'new-skill') {
          const skill = active.data.current?.skill as Skill;
          const newMit: MitEvent = {
            id: crypto.randomUUID(),
            skillId: skill.id,
            tStartMs: tStartMs,
            durationMs: skill.durationSec * 1000,
            tEndMs: tStartMs + (skill.durationSec * 1000)
          };
          addMitEvent(newMit);
        } else if (type === 'existing-mit') {
          const mit = active.data.current?.mit as MitEvent;
          const { selectedMitIds, mitEvents, updateMitEvent } = useStore.getState();

          // Use event.delta directly for calculation to align with visual feedback
          // This avoids issues with getBoundingClientRect on drop for existing items
          const deltaMs = (event.delta.x / zoom) * 1000;

          // Check if the dragged item is part of the selection
          if (selectedMitIds.includes(mit.id)) {
            // Multi-item drag

            // VALIDATION PHASE
            let isValid = true;
            for (const id of selectedMitIds) {
              const item = mitEvents.find(m => m.id === id);
              if (!item) continue;
              const newStart = item.tStartMs + deltaMs;
              if (newStart < 0) {
                isValid = false; break;
              }

              // Modified conflict check logic: exclude all selected items from conflict check
              const conflict = checkConflict(item.skillId, newStart, item.id, mitEvents.filter(m => !selectedMitIds.includes(m.id)));
              if (conflict) {
                isValid = false; break;
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
            // Single item drag (legacy behavior for unselected item)
            // Also use deltaMs for consistency
            const newStart = mit.tStartMs + deltaMs;
            const clampedStart = Math.max(0, newStart);

            // Single item collision check
            if (checkConflict(mit.skillId, clampedStart, mit.id, mitEvents)) {
              console.warn("Skill is on cooldown (single drag)!");
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

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd}>

      <div className="min-h-screen bg-gray-900 text-white flex flex-col font-sans">
        {/* 顶部栏 (Top Bar) */}
        <div className="p-4 bg-gray-900 border-b border-gray-800 flex flex-wrap gap-4 items-center z-20 relative shadow-md">
          <div className="mr-4 font-bold text-xl bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
            XIV Mitigation Composer
          </div>

          <div className="flex gap-2 items-center bg-gray-800 p-1.5 rounded-lg border border-gray-700 shadow-inner">
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              className="bg-transparent border-none focus:ring-0 text-sm w-64 px-2 text-gray-200 placeholder-gray-600 outline-none"
              placeholder="API Key"
            />
            <div className="w-[1px] h-4 bg-gray-700"></div>
            <input
              type="text"
              value={fflogsUrl}
              onChange={e => {
                setFflogsUrl(e.target.value);
                // Automatically parse the URL when it changes
                const parsed = parseFFLogsUrl(e.target.value);
                if (parsed) {
                  setReportCode(parsed.reportCode);
                  setFightId(parsed.fightId);
                }
              }}
              className="bg-transparent border-none focus:ring-0 text-sm w-[32rem] px-2 text-gray-200 placeholder-gray-600 outline-none"
              placeholder="FFLogs URL (e.g., https://cn.fflogs.com/reports/...)"
            />
          </div>

          <button
            onClick={() => loadFightMetadata()}
            disabled={isLoading || !apiKey || !reportCode}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:bg-gray-800 px-5 py-2 rounded-lg text-sm font-semibold transition-all shadow-lg active:scale-95 flex items-center gap-2 text-white"
          >
            {isLoading ? <span className="animate-spin">⏳</span> : '加载战斗'}
          </button>

          <div className="flex-1"></div>

          {/* 工具 */}
          <div className="flex gap-3">
            <button
              onClick={handleExportTimeline}
              disabled={!fight || castEvents.length === 0}
              className="bg-green-800 hover:bg-green-700 disabled:opacity-50 px-4 py-2 rounded-lg text-xs font-semibold transition-colors border border-gray-700 text-green-100 shadow-sm hover:text-white"
            >
              导出 Souma 时间轴
            </button>
          </div>

          {error && <div className="absolute top-full left-0 w-full bg-red-900/90 text-red-100 text-xs px-4 py-2 flex justify-center backdrop-blur-sm z-30">{error}</div>}
        </div>

        {/* 战斗信息与选择器 */}
        {fight && (
          <div className="px-6 py-3 bg-gray-900 border-b border-gray-800 flex gap-6 items-center flex-wrap z-10 relative shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-xs font-bold uppercase tracking-wider">战斗</span>
              <span className="font-semibold text-white">{fight.name}</span>
              <span className="text-xs text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">{(fight.durationMs / 1000).toFixed(1)}s</span>
            </div>

            <div className="w-[1px] h-6 bg-gray-800"></div>

            <div className="flex items-center gap-3">
              <span className="text-gray-500 text-xs font-bold uppercase tracking-wider">职业</span>
              <div className="flex bg-gray-800 rounded-lg p-1 gap-1 border border-gray-700">
                {(['PLD', 'WAR', 'DRK', 'GNB'] as Job[]).map(job => (
                  <button
                    key={job}
                    onClick={() => setSelectedJob(job)}
                    className={cn(
                      "px-3 py-1 rounded-md text-xs font-bold transition-all",
                      selectedJob === job ? "bg-blue-600 text-white shadow-sm" : "hover:bg-gray-700 text-gray-400 hover:text-gray-200"
                    )}
                  >
                    {job}
                  </button>
                ))}
              </div>
            </div>

            <div className="w-[1px] h-6 bg-gray-800"></div>

            <div className="flex items-center gap-3">
              <span className="text-gray-500 text-xs font-bold uppercase tracking-wider">玩家</span>
              <div className="relative">
                <select
                  value={selectedPlayerId || ''}
                  onChange={e => setSelectedPlayerId(Number(e.target.value))}
                  className="appearance-none bg-gray-800 border border-gray-700 hover:border-gray-600 rounded-lg pl-3 pr-8 py-1.5 text-sm w-64 text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors cursor-pointer"
                >
                  <option value="">选择玩家...</option>
                  {actors
                    .filter(actor => {
                      if (!selectedJob) return true;
                      const map: Record<string, string[]> = {
                        'PLD': ['Paladin'],
                        'WAR': ['Warrior'],
                        'DRK': ['DarkKnight', 'Dark Knight'],
                        'GNB': ['Gunbreaker']
                      };
                      return map[selectedJob]?.includes(actor.type) || map[selectedJob]?.includes(actor.subType);
                    })
                    .map(actor => (
                      <option key={actor.id} value={actor.id}>{actor.name} ({actor.type})</option>
                    ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-gray-500 text-xs">▼</div>
              </div>
            </div>
          </div>
        )}

        {/* 主内容区域 - 使用 max-h-0 + flex-1 让其撑开剩余空间 */}
        <div className="flex-1 flex overflow-hidden max-h-full">
          {(!fight || !selectedJob || !selectedPlayerId) && (
            <div className="m-auto text-gray-500 text-center p-8 bg-gray-900 w-full h-full flex flex-col items-center justify-center">
              <p className="text-xl font-bold mb-3 text-gray-400">欢迎使用 XIV 减伤排轴器</p>
              <p className="text-gray-600">{!fight ? '请先在上方加载战斗数据。' : '请选择当前职业和玩家以开始。'}</p>
            </div>
          )}

          {fight && selectedJob && selectedPlayerId && (
            <>
              {/* 左侧: 技能 */}
              <div className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col z-10 shadow-lg">
                <div className="p-4 border-b border-gray-800 bg-gray-900">
                  <h3 className="font-bold text-gray-300 text-sm uppercase tracking-wide">可用技能 ({selectedJob})</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                  {SKILLS.filter(s => s.job === selectedJob || s.job === 'ALL').map(skill => (
                    <DraggableSkill key={skill.id} skill={skill} />
                  ))}
                </div>
              </div>

              {/* 右侧: 时间轴容器 */}
              <div className="flex-1 bg-gray-950 relative overflow-hidden flex flex-col">
                <Timeline zoom={zoom} setZoom={setZoom} activeDragId={activeItem?.type === 'existing-mit' ? activeItem.mit.id : null} dragDeltaMs={dragDeltaMs} />
              </div>
            </>
          )}

          {/* 全局加载遮罩 */}
          {(isLoading || isRendering) && (
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-50 flex flex-col items-center justify-center text-white">
              <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500 mb-4"></div>
              <p className="text-lg font-semibold animate-pulse">{isLoading ? '正在加载数据...' : '正在渲染...'}</p>
              <p className="text-sm text-gray-400 mt-2">数据量较大时可能需要几秒钟</p>
            </div>
          )}
        </div>
      </div>

      {/* 拖拽覆盖层 (Drag Overlay) */}
      <DragOverlay>
        {activeItem && activeItem.type === 'new-skill' && (
          <SkillCard skill={activeItem.skill} className="opacity-90 shadow-2xl scale-105" />
        )}
        {activeItem && activeItem.type === 'existing-mit' && (
          <MitigationBar
            mit={activeItem.mit}
            width={(activeItem.mit.durationMs / 1000) * zoom}
            isOverlay
          />
        )}
      </DragOverlay>

      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        content={exportContent}
      />
    </DndContext >
  );
}
