import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  type Actor,
  type CastEvent,
  type CooldownEvent,
  type DamageEvent,
  type DamageEventsByPlayerId,
  type Fight,
  type Job,
  type MitEvent,
  type PartyMember,
  type ResourceEvent,
} from '../model/types';
import type { BannerItem, BannerOptions } from '../model/banner';
import { FFLogsClient } from '../lib/fflogs/client';
import { FFLogsProcessor } from '../lib/fflogs/processor';
import { SKILLS, withOwnerSkillId } from '../data/skills';
import { buildCastEvents } from '../domain/fflogs/buildCastEvents';
import { buildMitEvents } from '../domain/fflogs/buildMitEvents';
import { buildDamageEventsByPlayerId } from '../domain/fflogs/buildDamageEventsByPlayerId';
import { resolveActorJob } from '../model/jobs';
import { buildPlayerCastStateTolerant, evaluateMitigationSetStrict } from '../utils/playerCast';
import { parseFFLogsUrl } from '../utils';
import type { ProjectSlot, XmcProjectDocument } from '../model/project';
import {
  areProjectDocumentsContentEqual,
  createDefaultProjectSlot,
  createProjectDocumentFromState,
  createProjectSlotId,
  normalizeProjectDocument,
} from '../domain/project/projectDocument';
import type { WebDavSettings } from '../model/sync';

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
  partyMembers: PartyMember[];
  damageEventMembers: PartyMember[];
  selectedMitIds: string[];

  damageEventsByPlayerId: DamageEventsByPlayerId;
  castEvents: CastEvent[];
  mitEvents: MitEvent[];
  cooldownEvents: CooldownEvent[];
  resourceEvents: ResourceEvent[];
  banners: BannerItem[];
  projectSlots: ProjectSlot[];
  activeProjectSlotId: string | null;
  webDavSettings: WebDavSettings;

  // UI 状态
  isLoading: boolean;
  isRendering: boolean;
  error: string | null;

  setApiKey: (key: string) => void;
  setFflogsUrl: (url: string) => void;
  setPartyMembers: (members: PartyMember[]) => void;
  updatePartyMemberCollapsed: (playerId: number, collapsed: boolean) => void;
  setAllPartyMembersCollapsed: (collapsed: boolean) => void;
  setSelectedMitIds: (ids: string[]) => void;
  setIsRendering: (is: boolean) => void;
  pushBanner: (message: string, options?: BannerOptions) => number;
  closeBanner: (id: number) => void;

  loadFightMetadata: () => Promise<void>;
  loadEventsForPlayers: (players: PartyMember[]) => Promise<void>;

  addMitEvent: (event: MitEvent) => void;
  updateMitEvent: (id: string, updates: Partial<MitEvent>) => void;
  removeMitEvent: (id: string) => void;
  setMitEvents: (events: MitEvent[]) => void;
  saveCurrentProjectSlot: (zoom: number) => void;
  createProjectSlot: (name: string, zoom: number) => ProjectSlot;
  duplicateProjectSlot: (name: string) => ProjectSlot;
  renameProjectSlot: (id: string, name: string) => void;
  deleteProjectSlot: (id: string) => XmcProjectDocument | null;
  switchProjectSlot: (id: string) => XmcProjectDocument | null;
  importProjectDocument: (document: XmcProjectDocument, name?: string) => ProjectSlot;
  replaceProjectSlots: (slots: ProjectSlot[], activeSlotId: string) => XmcProjectDocument;
  setWebDavSettings: (settings: WebDavSettings) => void;
}

const SKILL_BY_ACTION_ID = new Map(SKILLS.map((skill) => [skill.actionId, skill]));
const getSkillByActionId = (actionId: number) => SKILL_BY_ACTION_ID.get(actionId);

interface LoadEventsPlayer {
  id: number;
  job: Job;
  name?: string;
}

interface LoadEventsCoreResult {
  damageEventsByPlayerId: DamageEventsByPlayerId;
  castEvents: CastEvent[];
  mitEvents: MitEvent[];
  cooldownEvents: CooldownEvent[];
  resourceEvents: ResourceEvent[];
}

const loadEventsCore = async ({
  client,
  reportCode,
  fight,
  bossIds,
  castPlayers,
  damagePlayers,
  signal,
}: {
  client: FFLogsClient;
  reportCode: string;
  fight: Fight;
  bossIds: number[];
  castPlayers: LoadEventsPlayer[];
  damagePlayers: LoadEventsPlayer[];
  signal: AbortSignal;
}): Promise<LoadEventsCoreResult> => {
  const friendlyCastsPromises = castPlayers.map(async (player) => {
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

  const damagePromises = damagePlayers.map(async (player) => ({
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

  const playerCastState = buildPlayerCastStateTolerant(mitEvents);
  const damageEventsByPlayerId = buildDamageEventsByPlayerId(
    damagesByPlayer.map((entry) => ({ playerId: entry.playerId, events: entry.events })),
    fight.start,
  );

  return {
    damageEventsByPlayerId,
    castEvents,
    mitEvents,
    cooldownEvents: playerCastState.cooldownEvents,
    resourceEvents: playerCastState.resourceEvents,
  };
};

const buildDamageEventMembers = (actors: Actor[]): PartyMember[] =>
  actors.flatMap((actor) => {
    const job = resolveActorJob(actor);
    if (!job) return [];
    return [
      {
        playerId: actor.id,
        name: actor.name,
        job,
        collapsed: false,
        source: 'player' as const,
      },
    ];
  });

const isPlayerPartyMember = (member: PartyMember) => member.source !== 'role';

let fightRequestSeq = 0;
let fightAbortController: AbortController | null = null;
let eventsRequestSeq = 0;
let eventsAbortController: AbortController | null = null;

const BANNER_DEFAULT_DURATION_MS = 3000;
const BANNER_CLOSE_MS = 240;
const BANNER_MAX = 4;
let bannerSeq = 0;
const bannerTimers = new Map<number, number>();
const initialProjectSlot = createDefaultProjectSlot();

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

export const migratePersistedState = (persistedState: unknown): AppState => {
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

  const partyMembers =
    state.partyMembers && state.partyMembers.length
      ? state.partyMembers
      : typeof state.selectedPlayerId === 'number' && state.selectedJob
        ? [
            {
              playerId: state.selectedPlayerId,
              name: '旧选择玩家',
              job: state.selectedJob,
              collapsed: false,
            },
          ]
        : [];
  const now = new Date().toISOString();
  const playerCastState = buildPlayerCastStateTolerant(mitEvents);
  const migratedState = {
    ...state,
    mitEvents,
    partyMembers,
    actors: state.actors ?? [],
    bossIds: state.bossIds ?? [],
    damageEventMembers: state.damageEventMembers ?? [],
    damageEventsByPlayerId: state.damageEventsByPlayerId ?? {},
    castEvents: state.castEvents ?? [],
    cooldownEvents: playerCastState.cooldownEvents,
    resourceEvents: playerCastState.resourceEvents,
    fflogsUrl: state.fflogsUrl ?? '',
    fight: state.fight ?? null,
    selectedJob: state.selectedJob ?? null,
    selectedPlayerId: state.selectedPlayerId ?? null,
  } as AppState;

  const projectSlots =
    state.projectSlots && state.projectSlots.length
      ? state.projectSlots.map((slot) => {
          try {
            const document = normalizeProjectDocument(slot.document);
            return {
              ...slot,
              name: slot.name || document.name,
              updatedAt: slot.updatedAt || document.updatedAt,
              document,
            };
          } catch {
            return slot;
          }
        })
      : [
          {
            ...createDefaultProjectSlot(now),
            document: createProjectDocumentFromState(
              migratedState,
              initialProjectSlot.document.ui.zoom,
            ),
          },
        ];

  return {
    ...migratedState,
    projectSlots,
    activeProjectSlotId: state.activeProjectSlotId ?? projectSlots[0]?.id ?? null,
    webDavSettings: {
      url: state.webDavSettings?.url ?? '',
      username: state.webDavSettings?.username ?? '',
      password: state.webDavSettings?.password ?? '',
    },
  } as AppState;
};

export const useStore = create<AppState>()(
  persist(
    (set, get) => {
      const commitMitigationSet = (events: MitEvent[]) => {
        const result = evaluateMitigationSetStrict(events);
        if (!result.ok) {
          return result;
        }

        set({
          mitEvents: result.mitEvents,
          cooldownEvents: result.cooldownEvents,
          resourceEvents: result.resourceEvents,
        });
        return result;
      };

      const buildProjectStatePatch = (document: XmcProjectDocument) => {
        const normalized = normalizeProjectDocument(document);
        const result = evaluateMitigationSetStrict(normalized.state.mitEvents);
        if (!result.ok) {
          throw new Error('工程中的减伤事件存在冷却冲突，无法导入');
        }

        return {
          document: normalized,
          patch: {
            fflogsUrl: normalized.state.fflogsUrl || normalized.source.fflogsUrl,
            fight: normalized.state.fight,
            actors: normalized.state.actors,
            bossIds: normalized.state.bossIds,
            selectedJob: normalized.state.selectedJob,
            selectedPlayerId: normalized.state.selectedPlayerId,
            partyMembers: normalized.state.partyMembers,
            damageEventMembers: normalized.state.damageEventMembers,
            selectedMitIds: [],
            damageEventsByPlayerId: normalized.state.damageEventsByPlayerId,
            castEvents: normalized.state.castEvents,
            mitEvents: result.mitEvents,
            cooldownEvents: result.cooldownEvents,
            resourceEvents: result.resourceEvents,
            isLoading: false,
            isRendering: false,
            error: null,
          },
        };
      };

      return {
        apiKey: '',
        fflogsUrl: '',
        fight: null,
        actors: [],
        bossIds: [],
        selectedJob: 'GNB',
        selectedPlayerId: null,
        partyMembers: [],
        damageEventMembers: [],
        selectedMitIds: [],
        damageEventsByPlayerId: {},
        castEvents: [],
        mitEvents: [],
        cooldownEvents: [],
        resourceEvents: [],
        banners: [],
        projectSlots: [initialProjectSlot],
        activeProjectSlotId: initialProjectSlot.id,
        webDavSettings: { url: '', username: '', password: '' },
        isLoading: false,
        isRendering: false,
        error: null,

        setApiKey: (key) => set({ apiKey: key }),
        setFflogsUrl: (url) => set({ fflogsUrl: url }),
        setWebDavSettings: (settings) => set({ webDavSettings: settings }),
        setPartyMembers: (members) => {
          set({
            partyMembers: members,
            selectedJob: members[0]?.job ?? null,
            selectedPlayerId: members[0]?.playerId ?? null,
          });
        },
        updatePartyMemberCollapsed: (playerId, collapsed) => {
          set((state) => ({
            partyMembers: state.partyMembers.map((member) =>
              member.playerId === playerId ? { ...member, collapsed } : member,
            ),
          }));
        },
        setAllPartyMembersCollapsed: (collapsed) => {
          set((state) => ({
            partyMembers: state.partyMembers.map((member) => ({ ...member, collapsed })),
          }));
        },
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
              zoneID: fightMeta.zoneID,
              fflogsBoss: fightMeta.boss,
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

            set({
              fight,
              actors,
              bossIds,
              partyMembers: [],
              damageEventMembers: buildDamageEventMembers(actors),
              selectedMitIds: [],
              damageEventsByPlayerId: {},
              castEvents: [],
              mitEvents: [],
              cooldownEvents: [],
              resourceEvents: [],
              isLoading: false,
            });
          } catch (err: unknown) {
            if (requestId !== fightRequestSeq || isAbortError(err, signal)) return;
            console.error(err);
            const rawMsg = err instanceof Error ? err.message : String(err);
            const msg = rawMsg || '加载战斗失败';
            set({ error: msg, isLoading: false });
            get().pushBanner(msg, { tone: 'error' });
          }
        },

        loadEventsForPlayers: async (players) => {
          const { apiKey, fflogsUrl, fight, bossIds, actors } = get();
          const { reportCode } = parseFFLogsUrl(fflogsUrl) ?? {};
          if (!apiKey || !reportCode || !fight || players.length === 0) return;

          const { requestId, signal } = beginEventsRequest();
          set({ isLoading: true, isRendering: true, error: null });
          const client = new FFLogsClient(apiKey);
          const damageEventMembers = buildDamageEventMembers(actors);
          const castPlayers = players.filter(isPlayerPartyMember);

          try {
            const {
              damageEventsByPlayerId,
              castEvents,
              mitEvents,
              cooldownEvents,
              resourceEvents,
            } = await loadEventsCore({
              client,
              reportCode,
              fight,
              bossIds,
              castPlayers: castPlayers.map((player) => ({
                id: player.playerId,
                job: player.job,
                name: player.name,
              })),
              damagePlayers: damageEventMembers.map((player) => ({
                id: player.playerId,
                job: player.job,
                name: player.name,
              })),
              signal,
            });
            if (requestId !== eventsRequestSeq || signal.aborted) return;

            set({
              damageEventMembers,
              damageEventsByPlayerId,
              castEvents,
              mitEvents,
              cooldownEvents,
              resourceEvents,
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
          const state = get();
          commitMitigationSet([...state.mitEvents, event]);
        },

        updateMitEvent: (id: string, updates: Partial<MitEvent>) => {
          const state = get();
          commitMitigationSet(state.mitEvents.map((e) => (e.id === id ? { ...e, ...updates } : e)));
        },

        removeMitEvent: (id: string) => {
          const state = get();
          commitMitigationSet(state.mitEvents.filter((e) => e.id !== id));
        },

        setMitEvents: (events) => {
          commitMitigationSet(events);
        },

        saveCurrentProjectSlot: (zoom) => {
          set((state) => {
            const fallbackSlot = state.projectSlots[0] ?? createDefaultProjectSlot();
            const activeSlot =
              state.projectSlots.find((slot) => slot.id === state.activeProjectSlotId) ??
              fallbackSlot;
            const document = createProjectDocumentFromState(
              state,
              zoom,
              activeSlot.document,
              activeSlot.name,
            );
            if (areProjectDocumentsContentEqual(document, activeSlot.document)) {
              return state;
            }
            const nextSlot: ProjectSlot = {
              ...activeSlot,
              updatedAt: document.updatedAt,
              document,
            };
            const hasSlot = state.projectSlots.some((slot) => slot.id === nextSlot.id);
            const projectSlots = hasSlot
              ? state.projectSlots.map((slot) => (slot.id === nextSlot.id ? nextSlot : slot))
              : [nextSlot, ...state.projectSlots];

            return {
              projectSlots,
              activeProjectSlotId: nextSlot.id,
            };
          });
        },

        createProjectSlot: (name, zoom) => {
          const state = get();
          const slotName = name.trim() || `槽位 ${state.projectSlots.length + 1}`;
          const document = createProjectDocumentFromState(state, zoom, undefined, slotName);
          const slot: ProjectSlot = {
            id: createProjectSlotId(),
            name: slotName,
            updatedAt: document.updatedAt,
            document,
          };

          set((current) => ({
            projectSlots: [slot, ...current.projectSlots],
            activeProjectSlotId: slot.id,
          }));

          return slot;
        },

        duplicateProjectSlot: (name) => {
          const state = get();
          const source =
            state.projectSlots.find((slot) => slot.id === state.activeProjectSlotId) ??
            state.projectSlots[0];
          if (!source) {
            return get().createProjectSlot(name, initialProjectSlot.document.ui.zoom);
          }

          const now = new Date().toISOString();
          const slotName = name.trim() || `${source.name} 副本`;
          const document: XmcProjectDocument = {
            ...source.document,
            name: slotName,
            createdAt: now,
            updatedAt: now,
          };
          const slot: ProjectSlot = {
            id: createProjectSlotId(),
            name: slotName,
            updatedAt: now,
            document,
          };

          set((current) => ({
            projectSlots: [slot, ...current.projectSlots],
            activeProjectSlotId: slot.id,
          }));

          const { patch } = buildProjectStatePatch(document);
          set(patch);
          return slot;
        },

        renameProjectSlot: (id, name) => {
          const trimmed = name.trim();
          if (!trimmed) return;

          set((state) => {
            const current = state.projectSlots.find((slot) => slot.id === id);
            if (!current || current.name === trimmed) return state;
            const now = new Date().toISOString();
            return {
              projectSlots: state.projectSlots.map((slot) =>
                slot.id === id
                  ? {
                      ...slot,
                      name: trimmed,
                      updatedAt: now,
                      document: {
                        ...slot.document,
                        name: trimmed,
                        updatedAt: now,
                      },
                    }
                  : slot,
              ),
            };
          });
        },

        deleteProjectSlot: (id) => {
          const state = get();
          const remaining = state.projectSlots.filter((slot) => slot.id !== id);
          const nextSlots = remaining.length ? remaining : [createDefaultProjectSlot()];
          const nextActiveId =
            state.activeProjectSlotId === id
              ? nextSlots[0]?.id
              : (state.activeProjectSlotId ?? nextSlots[0]?.id);
          const nextActiveSlot = nextSlots.find((slot) => slot.id === nextActiveId) ?? nextSlots[0];

          set({
            projectSlots: nextSlots,
            activeProjectSlotId: nextActiveSlot?.id ?? null,
          });

          if (!nextActiveSlot || state.activeProjectSlotId !== id) {
            return null;
          }

          const { document, patch } = buildProjectStatePatch(nextActiveSlot.document);
          set(patch);
          return document;
        },

        switchProjectSlot: (id) => {
          const slot = get().projectSlots.find((item) => item.id === id);
          if (!slot) return null;

          const { document, patch } = buildProjectStatePatch(slot.document);
          set({
            ...patch,
            activeProjectSlotId: id,
          });
          return document;
        },

        importProjectDocument: (document, name) => {
          const { document: normalized, patch } = buildProjectStatePatch(document);
          const slotName =
            name?.trim() || normalized.name || normalized.state.fight?.name || '导入工程';
          const slot: ProjectSlot = {
            id: createProjectSlotId(),
            name: slotName,
            updatedAt: normalized.updatedAt,
            document: { ...normalized, name: slotName },
          };

          set((state) => ({
            ...patch,
            projectSlots: [slot, ...state.projectSlots],
            activeProjectSlotId: slot.id,
          }));

          return slot;
        },

        replaceProjectSlots: (slots, activeSlotId) => {
          if (!slots.length) {
            throw new Error('远程同步存档没有工程槽位');
          }

          const normalizedSlots = slots.map((slot) => {
            const normalized = normalizeProjectDocument(slot.document);
            const result = evaluateMitigationSetStrict(normalized.state.mitEvents);
            if (!result.ok) {
              throw new Error(`槽位「${slot.name}」中的减伤事件存在冷却冲突，无法下载`);
            }
            return {
              ...slot,
              name: slot.name || normalized.name,
              updatedAt: slot.updatedAt || normalized.updatedAt,
              document: normalized,
            };
          });
          const activeSlot =
            normalizedSlots.find((slot) => slot.id === activeSlotId) ?? normalizedSlots[0];
          if (!activeSlot) {
            throw new Error('远程同步存档的当前槽位无效');
          }

          const { document, patch } = buildProjectStatePatch(activeSlot.document);
          set({
            ...patch,
            projectSlots: normalizedSlots,
            activeProjectSlotId: activeSlot.id,
          });
          return document;
        },
      };
    },
    {
      name: 'xiv-mit-composer-storage',
      version: 5,
      migrate: migratePersistedState,
      partialize: (state) => ({
        apiKey: state.apiKey,
        fflogsUrl: state.fflogsUrl,
        fight: state.fight,
        actors: state.actors,
        bossIds: state.bossIds,
        selectedJob: state.selectedJob,
        selectedPlayerId: state.selectedPlayerId,
        partyMembers: state.partyMembers,
        damageEventMembers: state.damageEventMembers,
        damageEventsByPlayerId: state.damageEventsByPlayerId,
        castEvents: state.castEvents,
        mitEvents: state.mitEvents,
        projectSlots: state.projectSlots,
        activeProjectSlotId: state.activeProjectSlotId,
        webDavSettings: state.webDavSettings,
      }),
    },
  ),
);
