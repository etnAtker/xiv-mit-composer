import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  type Actor,
  type CastEvent,
  type CooldownEvent,
  type DamageEvent,
  type Fight,
  type Job,
  type MitEvent,
} from '../model/types';
import { FFLogsClient } from '../lib/fflogs/client';
import { FFLogsProcessor } from '../lib/fflogs/processor';
import { SKILLS } from '../data/skills';
import { MS_PER_SEC } from '../constants/time';
import { tryBuildCooldowns } from '../utils/playerCast';
import { parseFFLogsUrl } from '../utils';

interface AppState {
  // 输入状态
  apiKey: string;
  fflogsUrl: string;

  // 数据状态
  fight: Fight | null;
  actors: Actor[];
  bossIds: number[]; // 记录参与战斗的 Boss ID
  selectedJob: Job | null;
  selectedPlayerId: number | null;
  selectedMitIds: string[];

  damageEvents: DamageEvent[];
  castEvents: CastEvent[];
  mitEvents: MitEvent[];
  cooldownEvents: CooldownEvent[];

  // UI 状态
  isLoading: boolean;
  isRendering: boolean;
  error: string | null;

  setApiKey: (key: string) => void;
  setFflogsUrl: (url: string) => void;
  setSelectedJob: (job: Job) => void;
  setSelectedPlayerId: (id: number) => void;
  setSelectedMitIds: (ids: string[]) => void;
  setIsRendering: (is: boolean) => void;

  loadFightMetadata: () => Promise<void>;
  loadEvents: () => Promise<void>;

  addMitEvent: (event: MitEvent) => void;
  updateMitEvent: (id: string, updates: Partial<MitEvent>) => void;
  removeMitEvent: (id: string) => void;
  setMitEvents: (events: MitEvent[]) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      apiKey: '',
      fflogsUrl: '',
      fight: null,
      actors: [],
      bossIds: [],
      selectedJob: 'GNB',
      selectedPlayerId: null,
      selectedMitIds: [],
      damageEvents: [],
      castEvents: [],
      mitEvents: [],
      cooldownEvents: [],
      isLoading: false,
      isRendering: false,
      error: null,

      setApiKey: (key) => set({ apiKey: key }),
      setFflogsUrl: (url) => set({ fflogsUrl: url }),
      setSelectedJob: (job) => set({ selectedJob: job }),
      setSelectedPlayerId: (id) => set({ selectedPlayerId: id }),
      setSelectedMitIds: (ids) => set({ selectedMitIds: ids }),
      setIsRendering: (is) => set({ isRendering: is }),

      loadFightMetadata: async () => {
        const { apiKey, fflogsUrl } = get();
        const { reportCode, fightId } = parseFFLogsUrl(fflogsUrl) ?? {};

        if (!apiKey || !reportCode) {
          set({ error: 'FFLogs URL 不合法' });
          return;
        }

        set({ isLoading: true, error: null });
        try {
          const client = new FFLogsClient(apiKey);
          const report = await client.fetchReport(reportCode);

          let fightMeta;
          if (fightId === 'last') {
            // 选择报告中最后一场战斗
            fightMeta = report.fights[report.fights.length - 1];
          } else {
            // 按战斗 ID 查找战斗
            fightMeta = report.fights.find((f) => f.id === Number(fightId));
          }

          if (!fightMeta) {
            throw new Error('报告中未找到该 Fight ID');
          }

          const fight: Fight = {
            id: fightMeta.id,
            start: fightMeta.start_time,
            end: fightMeta.end_time,
            durationMs: fightMeta.end_time - fightMeta.start_time,
            name: fightMeta.name,
          };

          const actors: Actor[] = report.friendlies
            .filter((f) => f.type !== 'LimitBreak' && f.type !== 'Environment') // 过滤非战斗单位
            .map((f) => ({
              id: f.id,
              name: f.name,
              type: f.type,
              subType: f.type, // 兼容旧字段
            }));

          // 记录当前战斗中的 Boss
          const bossIds: number[] = [];
          report.enemies.forEach((e) => {
            if (e.type === 'Boss' && e.fights.some((f) => f.id === fight.id)) {
              bossIds.push(e.id);
            }
          });

          set({ fight, actors, bossIds, isLoading: false });
        } catch (err: unknown) {
          console.error(err);
          const msg = err instanceof Error ? err.message : String(err);
          set({ error: msg || '加载战斗失败', isLoading: false });
        }
      },

      loadEvents: async () => {
        const { apiKey, fflogsUrl, fight, selectedPlayerId, selectedJob, bossIds } = get();
        const { reportCode } = parseFFLogsUrl(fflogsUrl) ?? {};
        if (!apiKey || !reportCode || !fight || !selectedPlayerId) return;

        // 标记渲染中，等待 Timeline 通知完成
        set({ isLoading: true, isRendering: true, error: null });
        const client = new FFLogsClient(apiKey);

        try {
          // 获取承伤事件
          const damagePromise = client.fetchEvents<DamageEvent>(
            reportCode,
            fight.start,
            fight.end,
            selectedPlayerId,
            false,
            'damage-taken',
          );

          // 获取友方施法事件并按技能表过滤
          const allowedActionIds = new Set(
            SKILLS.filter((s) => s.job === selectedJob || s.job === 'ALL')
              .map((s) => s.actionId)
              .filter((id): id is number => !!id),
          );

          const friendlyCastsPromise = client
            .fetchEvents(reportCode, fight.start, fight.end, selectedPlayerId, false)
            .then((events) =>
              FFLogsProcessor.processFriendlyEvents(events, fight.start, allowedActionIds),
            );

          // 获取敌方施法事件（覆盖所有检测到的 Boss）
          const enemyCastsPromises = bossIds.map((bossId) =>
            client.fetchEvents(reportCode, fight.start, fight.end, bossId, true),
          );

          const [damages, friendlyCasts, enemyCastsMatrix] = await Promise.all([
            damagePromise,
            friendlyCastsPromise,
            Promise.all(enemyCastsPromises),
          ]);

          const flatEnemyEvents = enemyCastsMatrix.flat();
          const processedEnemyCasts = FFLogsProcessor.processEnemyEvents(
            flatEnemyEvents,
            fight.start,
          );

          // 转换为内部事件结构

          // 友方施法 -> 减伤事件
          const newMitEvents: MitEvent[] = friendlyCasts
            .map((e): MitEvent | null => {
              // 根据技能定义补充持续时间
              const skillDef = SKILLS.find((s) => s.actionId === e.actionId);
              if (!skillDef) return null;

              const tStartMs = e.time * MS_PER_SEC;
              const durationMs = skillDef.durationSec * MS_PER_SEC;

              return {
                id: crypto.randomUUID(),
                eventType: 'mit',
                skillId: skillDef.id,
                tStartMs: tStartMs,
                durationMs: durationMs,
                tEndMs: tStartMs + durationMs,
              };
            })
            .filter((e): e is MitEvent => !!e);

          // 敌方施法 -> 读条列表
          const finalCasts: CastEvent[] = processedEnemyCasts
            .map((e) => ({
              timestamp: fight.start + e.time * MS_PER_SEC,
              tMs: e.time * MS_PER_SEC,
              type: e.type,
              sourceID: e.sourceID,
              targetID: 0,
              ability: { guid: e.actionId, name: e.actionName, type: 0 },
              originalActionId: e.actionId,
              isBossEvent: true,
              isFriendly: false,
              originalType: e.type as 'cast' | 'begincast',
              duration: e.duration,
            }))
            .sort((a, b) => a.tMs - b.tMs);

          // 按 packetID 合并同一条伤害记录
          const processTimestamp = (e: DamageEvent): DamageEvent => ({
            ...e,
            tMs: e.timestamp - fight.start,
          });
          const dict = new Map<number, { calc?: DamageEvent; dmg?: DamageEvent }>();
          const standaloneEvents: DamageEvent[] = [];

          damages.forEach((e) => {
            const pid = e.packetID;
            if (pid) {
              if (!dict.has(pid)) dict.set(pid, {});
              const entry = dict.get(pid)!;

              if (e.type === 'calculateddamage') {
                entry.calc = e;
              } else {
                entry.dmg = e;
              }
            } else {
              if (e.type === 'calculateddamage') {
                standaloneEvents.push({
                  ...e,
                  ability: { ...e.ability, name: `? ${e.ability.name}` },
                });
              } else {
                standaloneEvents.push(e);
              }
            }
          });

          const combinedDamages: DamageEvent[] = [];

          for (const { calc, dmg } of dict.values()) {
            if (calc && dmg) {
              combinedDamages.push({
                ...dmg,
                timestamp: calc.timestamp,
                packetID: calc.packetID,
                type: 'damage-combined',
              });
            } else if (calc) {
              combinedDamages.push({
                ...calc,
                ability: { ...calc.ability, name: `? ${calc.ability.name}` },
              });
            } else if (dmg) {
              combinedDamages.push({
                ...dmg,
                ability: { ...dmg.ability, name: `* ${dmg.ability.name}` },
              });
            }
          }

          const finalDamages = [...standaloneEvents, ...combinedDamages].sort(
            (a, b) => a.timestamp - b.timestamp,
          );

          newMitEvents.sort((a, b) => a.tStartMs - b.tStartMs);
          const cooldowns = tryBuildCooldowns(newMitEvents) ?? [];
          set({
            damageEvents: finalDamages.map(processTimestamp),
            castEvents: finalCasts,
            mitEvents: newMitEvents,
            cooldownEvents: cooldowns,
            isLoading: false,
            // 等待 Timeline 通知渲染完成后再取消遮罩
          });
        } catch (err: unknown) {
          console.error(err);
          const msg = err instanceof Error ? err.message : String(err);
          set({ error: msg || '加载事件失败', isLoading: false, isRendering: false });
        }
      },

      addMitEvent: (event: MitEvent) => {
        set((state) => {
          const newMits = [...state.mitEvents, event];
          const cooldownEvents = tryBuildCooldowns(newMits);
          if (!cooldownEvents) return {};

          newMits.sort((a, b) => a.tStartMs - b.tStartMs);
          return {
            mitEvents: newMits,
            cooldownEvents,
          };
        });
      },

      updateMitEvent: (id: string, updates: Partial<MitEvent>) => {
        set((state) => {
          const newMits = state.mitEvents.map((e) => (e.id === id ? { ...e, ...updates } : e));
          const cooldownEvents = tryBuildCooldowns(newMits);
          if (!cooldownEvents) return {};

          newMits.sort((a, b) => a.tStartMs - b.tStartMs);
          return {
            mitEvents: newMits,
            cooldownEvents,
          };
        });
      },

      removeMitEvent: (id: string) =>
        set((state) => {
          const newMits = state.mitEvents.filter((e) => e.id !== id);
          const cooldownEvents = tryBuildCooldowns(newMits);
          if (!cooldownEvents) return {};

          return {
            mitEvents: newMits,
            cooldownEvents,
          };
        }),

      setMitEvents: (events) => {
        events.sort((a, b) => a.tStartMs - b.tStartMs);
        const cooldownEvents = tryBuildCooldowns(events);
        if (!cooldownEvents) return;
        set({ mitEvents: events, cooldownEvents });
      },
    }),
    {
      name: 'xiv-mit-composer-storage',
      partialize: (state) => ({
        apiKey: state.apiKey,
        fflogsUrl: state.fflogsUrl,
        selectedJob: state.selectedJob,
        selectedPlayerId: state.selectedPlayerId,
        mitEvents: state.mitEvents,
      }),
    },
  ),
);
