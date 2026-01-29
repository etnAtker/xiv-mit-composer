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
import type { BannerItem, BannerOptions } from '../model/banner';
import { FFLogsClient } from '../lib/fflogs/client';
import { FFLogsProcessor } from '../lib/fflogs/processor';
import { SKILLS, withOwnerSkillId } from '../data/skills';
import { buildCastEvents } from '../domain/fflogs/buildCastEvents';
import { buildMitEvents } from '../domain/fflogs/buildMitEvents';
import { buildDamageEventsByJob } from '../domain/fflogs/buildDamageEventsByJob';
import { mergeDamageEvents } from '../domain/fflogs/mergeDamageEvents';
import { tryBuildCooldowns } from '../utils/playerCast';
import { parseFFLogsUrl } from '../utils';

export interface AppState {
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
  damageEventsByJob: Partial<Record<Job, DamageEvent[]>>;
  castEvents: CastEvent[];
  mitEvents: MitEvent[];
  cooldownEvents: CooldownEvent[];
  banners: BannerItem[];

  // UI 状态
  isLoading: boolean;
  isRendering: boolean;
  error: string | null;

  setApiKey: (key: string) => void;
  setFflogsUrl: (url: string) => void;
  setSelectedJob: (job: Job | null) => void;
  setSelectedPlayerId: (id: number | null) => void;
  setSelectedMitIds: (ids: string[]) => void;
  setIsRendering: (is: boolean) => void;
  pushBanner: (message: string, options?: BannerOptions) => number;
  closeBanner: (id: number) => void;

  loadFightMetadata: () => Promise<void>;
  loadEvents: () => Promise<void>;
  loadEventsForPlayers: (players: { id: number; job: Job }[]) => Promise<void>;

  addMitEvent: (event: MitEvent) => void;
  updateMitEvent: (id: string, updates: Partial<MitEvent>) => void;
  removeMitEvent: (id: string) => void;
  setMitEvents: (events: MitEvent[]) => void;
}

const SKILL_BY_ACTION_ID = new Map(SKILLS.map((skill) => [skill.actionId, skill]));
const getSkillByActionId = (actionId: number) => SKILL_BY_ACTION_ID.get(actionId);

interface LoadEventsPlayer {
  id: number;
  job?: Job;
}

interface LoadEventsCoreResult {
  damageEvents: DamageEvent[];
  damageEventsByJob: Partial<Record<Job, DamageEvent[]>>;
  castEvents: CastEvent[];
  mitEvents: MitEvent[];
  cooldownEvents: CooldownEvent[];
}

const loadEventsCore = async ({
  client,
  reportCode,
  fight,
  bossIds,
  players,
  signal,
}: {
  client: FFLogsClient;
  reportCode: string;
  fight: Fight;
  bossIds: number[];
  players: LoadEventsPlayer[];
  signal: AbortSignal;
}): Promise<LoadEventsCoreResult> => {
  const friendlyCastsPromises = players.map(async (player) => {
    const allowedActionIds = new Set(
      SKILLS.filter((s) => s.job === player.job || s.job === 'ALL')
        .map((s) => s.actionId)
        .filter((id): id is number => !!id),
    );

    const events = await client.fetchEvents(
      reportCode,
      fight.start,
      fight.end,
      player.id,
      false,
      'casts',
      signal,
    );
    const casts = FFLogsProcessor.processFriendlyEvents(events, fight.start, allowedActionIds);
    return { casts, job: player.job, playerId: player.id };
  });

  const enemyCastsPromises = bossIds.map((bossId) =>
    client.fetchEvents(reportCode, fight.start, fight.end, bossId, true, 'casts', signal),
  );

  const damagePromises = players.map(async (player) => ({
    job: player.job,
    playerId: player.id,
    events: await client.fetchEvents<DamageEvent>(
      reportCode,
      fight.start,
      fight.end,
      player.id,
      false,
      'damage-taken',
      signal,
    ),
  }));

  const [damagesByPlayer, friendlyResults, enemyCastsMatrix] = await Promise.all([
    Promise.all(damagePromises),
    Promise.all(friendlyCastsPromises),
    Promise.all(enemyCastsPromises),
  ]);

  const flatEnemyEvents = enemyCastsMatrix.flat();
  const processedEnemyCasts = FFLogsProcessor.processEnemyEvents(flatEnemyEvents, fight.start);
  const castEvents = buildCastEvents(processedEnemyCasts, fight.start);

  const mitEvents = buildMitEvents(
    friendlyResults.map((result) => ({
      casts: result.casts,
      ownerJob: result.job,
      ownerId: result.playerId,
    })),
    getSkillByActionId,
    withOwnerSkillId,
  );

  const cooldownEvents = tryBuildCooldowns(mitEvents) ?? [];
  const primaryDamageEvents = damagesByPlayer[0]
    ? mergeDamageEvents(damagesByPlayer[0].events, fight.start)
    : [];

  const jobBatches = damagesByPlayer
    .filter((entry): entry is { job: Job; playerId: number; events: DamageEvent[] } => !!entry.job)
    .map((entry) => ({ job: entry.job, events: entry.events }));
  const damageEventsByJob = jobBatches.length
    ? buildDamageEventsByJob(jobBatches, fight.start)
    : {};

  return {
    damageEvents: primaryDamageEvents,
    damageEventsByJob,
    castEvents,
    mitEvents,
    cooldownEvents,
  };
};

let fightRequestSeq = 0;
let fightAbortController: AbortController | null = null;
let eventsRequestSeq = 0;
let eventsAbortController: AbortController | null = null;

const BANNER_DEFAULT_DURATION_MS = 3000;
const BANNER_CLOSE_MS = 240;
const BANNER_MAX = 4;
let bannerSeq = 0;
const bannerTimers = new Map<number, number>();

const clearBannerTimer = (id: number) => {
  const timer = bannerTimers.get(id);
  if (timer !== undefined) {
    if (typeof window !== 'undefined') {
      window.clearTimeout(timer);
    } else {
      clearTimeout(timer);
    }
    bannerTimers.delete(id);
  }
};

const beginFightRequest = () => {
  fightRequestSeq += 1;
  if (fightAbortController) fightAbortController.abort();
  fightAbortController = new AbortController();
  return { requestId: fightRequestSeq, signal: fightAbortController.signal };
};

const beginEventsRequest = () => {
  eventsRequestSeq += 1;
  if (eventsAbortController) eventsAbortController.abort();
  eventsAbortController = new AbortController();
  return { requestId: eventsRequestSeq, signal: eventsAbortController.signal };
};

const isAbortError = (error: unknown, signal: AbortSignal) => {
  if (signal.aborted) return true;
  return error instanceof Error && error.name === 'AbortError';
};

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
      damageEventsByJob: {},
      castEvents: [],
      mitEvents: [],
      cooldownEvents: [],
      banners: [],
      isLoading: false,
      isRendering: false,
      error: null,

      setApiKey: (key) => set({ apiKey: key }),
      setFflogsUrl: (url) => set({ fflogsUrl: url }),
      setSelectedJob: (job) => set({ selectedJob: job }),
      setSelectedPlayerId: (id) => set({ selectedPlayerId: id }),
      setSelectedMitIds: (ids) => set({ selectedMitIds: ids }),
      setIsRendering: (is) => set({ isRendering: is }),
      pushBanner: (message, options) => {
        const id = ++bannerSeq;
        const durationMs = options?.durationMs ?? BANNER_DEFAULT_DURATION_MS;

        set((state) => {
          const next = [
            ...state.banners,
            {
              id,
              message,
              tone: options?.tone ?? 'info',
              closing: false,
              durationMs,
            },
          ];

          if (next.length > BANNER_MAX) {
            const removalIndex = next.findIndex((item) => item.durationMs !== null);
            const index = removalIndex === -1 ? 0 : removalIndex;
            const removed = next[index];
            if (removed) {
              clearBannerTimer(removed.id);
            }
            return { banners: next.filter((_, i) => i !== index) };
          }

          return { banners: next };
        });

        if (durationMs !== null && typeof window !== 'undefined') {
          const timer = window.setTimeout(() => {
            set((state) => ({
              banners: state.banners.map((item) =>
                item.id === id ? { ...item, closing: true } : item,
              ),
            }));

            const closeTimer = window.setTimeout(() => {
              set((state) => ({
                banners: state.banners.filter((item) => item.id !== id),
              }));
              clearBannerTimer(id);
            }, BANNER_CLOSE_MS);
            bannerTimers.set(id, closeTimer);
          }, durationMs);
          bannerTimers.set(id, timer);
        }

        return id;
      },
      closeBanner: (id) => {
        clearBannerTimer(id);
        set((state) => ({
          banners: state.banners.map((item) =>
            item.id === id ? { ...item, closing: true } : item,
          ),
        }));

        if (typeof window === 'undefined') {
          set((state) => ({
            banners: state.banners.filter((item) => item.id !== id),
          }));
          return;
        }

        const timer = window.setTimeout(() => {
          set((state) => ({
            banners: state.banners.filter((item) => item.id !== id),
          }));
          clearBannerTimer(id);
        }, BANNER_CLOSE_MS);
        bannerTimers.set(id, timer);
      },

      loadFightMetadata: async () => {
        const { requestId, signal } = beginFightRequest();
        const { apiKey, fflogsUrl } = get();
        const parsed = parseFFLogsUrl(fflogsUrl);
        const reportCode = parsed?.reportCode;
        const fightId = parsed?.fightId;

        if (!apiKey || !reportCode) {
          if (requestId !== fightRequestSeq) return;
          const msg = !apiKey ? '未输入 API Key' : 'FFLogs URL 不合法';
          set({ error: msg, isLoading: false });
          get().pushBanner(msg, { tone: 'error' });
          return;
        }

        set({ isLoading: true, error: null });
        try {
          const client = new FFLogsClient(apiKey);
          const report = await client.fetchReport(reportCode, signal);
          if (requestId !== fightRequestSeq || signal.aborted) return;

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
            .filter((f) => f.fights?.some((fightRef) => fightRef.id === fightMeta.id))
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
          if (requestId !== fightRequestSeq || isAbortError(err, signal)) return;
          console.error(err);
          const rawMsg = err instanceof Error ? err.message : String(err);
          const msg = rawMsg || '加载战斗失败';
          set({ error: msg, isLoading: false });
          get().pushBanner(msg, { tone: 'error' });
        }
      },

      loadEvents: async () => {
        const { apiKey, fflogsUrl, fight, selectedPlayerId, selectedJob, bossIds } = get();
        const { reportCode } = parseFFLogsUrl(fflogsUrl) ?? {};
        if (!apiKey || !reportCode || !fight || !selectedPlayerId) return;

        // 标记渲染中，等待 Timeline 通知完成
        const { requestId, signal } = beginEventsRequest();
        set({ isLoading: true, isRendering: true, error: null });
        const client = new FFLogsClient(apiKey);

        try {
          const { damageEvents, damageEventsByJob, castEvents, mitEvents, cooldownEvents } =
            await loadEventsCore({
              client,
              reportCode,
              fight,
              bossIds,
              players: [{ id: selectedPlayerId, job: selectedJob ?? undefined }],
              signal,
            });
          if (requestId !== eventsRequestSeq || signal.aborted) return;

          set({
            damageEvents,
            damageEventsByJob,
            castEvents,
            mitEvents,
            cooldownEvents,
            isLoading: false,
            // 等待 Timeline 通知渲染完成后再取消遮罩
          });
        } catch (err: unknown) {
          if (requestId !== eventsRequestSeq || isAbortError(err, signal)) return;
          console.error(err);
          const rawMsg = err instanceof Error ? err.message : String(err);
          const msg = rawMsg || '加载事件失败';
          set({ error: msg, isLoading: false, isRendering: false });
          get().pushBanner(msg, { tone: 'error' });
        }
      },

      loadEventsForPlayers: async (players) => {
        const { apiKey, fflogsUrl, fight, bossIds } = get();
        const { reportCode } = parseFFLogsUrl(fflogsUrl) ?? {};
        if (!apiKey || !reportCode || !fight || players.length === 0) return;

        const { requestId, signal } = beginEventsRequest();
        set({ isLoading: true, isRendering: true, error: null });
        const client = new FFLogsClient(apiKey);

        try {
          const { damageEvents, damageEventsByJob, castEvents, mitEvents, cooldownEvents } =
            await loadEventsCore({
              client,
              reportCode,
              fight,
              bossIds,
              players,
              signal,
            });
          if (requestId !== eventsRequestSeq || signal.aborted) return;

          const primaryJob = players[0]?.job;
          const primaryDamages = primaryJob ? (damageEventsByJob[primaryJob] ?? []) : damageEvents;
          set({
            damageEvents: primaryDamages,
            damageEventsByJob,
            castEvents,
            mitEvents,
            cooldownEvents,
            isLoading: false,
          });
        } catch (err: unknown) {
          if (requestId !== eventsRequestSeq || isAbortError(err, signal)) return;
          console.error(err);
          const rawMsg = err instanceof Error ? err.message : String(err);
          const msg = rawMsg || '加载事件失败';
          set({ error: msg, isLoading: false, isRendering: false });
          get().pushBanner(msg, { tone: 'error' });
        }
      },

      addMitEvent: (event: MitEvent) => {
        set((state) => {
          const newMits = [...state.mitEvents, event];
          const cooldownEvents = tryBuildCooldowns(newMits) ?? [];

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
          const cooldownEvents = tryBuildCooldowns(newMits) ?? [];

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
          const cooldownEvents = tryBuildCooldowns(newMits) ?? [];

          return {
            mitEvents: newMits,
            cooldownEvents,
          };
        }),

      setMitEvents: (events) => {
        const sortedEvents = [...events].sort((a, b) => a.tStartMs - b.tStartMs);
        const cooldownEvents = tryBuildCooldowns(sortedEvents) ?? [];
        set({ mitEvents: sortedEvents, cooldownEvents });
      },
    }),
    {
      name: 'xiv-mit-composer-storage',
      version: 1,
      migrate: (persistedState) => {
        const state = persistedState as Partial<AppState>;
        const fallbackOwnerId =
          typeof state.selectedPlayerId === 'number' ? state.selectedPlayerId : undefined;
        const fallbackOwnerJob = state.selectedJob ?? undefined;
        const mitEvents =
          state.mitEvents?.map((event) => {
            if (event.ownerId || event.ownerJob) return event;
            return {
              ...event,
              ownerId: fallbackOwnerId,
              ownerJob: fallbackOwnerJob,
            };
          }) ?? [];

        return {
          ...state,
          mitEvents,
        } as AppState;
      },
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
