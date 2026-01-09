import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Actor, CastEvent, DamageEvent, Fight, Job, MitEvent } from '../model/types';
import { fetchEvents as fetchOldEvents, fetchReport } from '../api/fflogsV1';
import { FFLogsClient } from '../lib/fflogs/client';
import { FFLogsProcessor } from '../lib/fflogs/processor';
import { SKILLS } from '../data/skills';
import { parseFFLogsUrl } from '../utils';

interface AppState {
    // 输入
    apiKey: string;
    reportCode: string;
    fightId: string; // 用户输入通常是字符串，解析为数字

    // 数据
    fight: Fight | null;
    actors: Actor[];
    bossIds: number[]; // 存储 Boss ID 用于获取敌方施法
    selectedJob: Job | null;
    selectedPlayerId: number | null;
    selectedMitIds: string[];

    damageEvents: DamageEvent[];
    castEvents: CastEvent[];
    mitEvents: MitEvent[];

    // UI 状态
    isLoading: boolean;
    isRendering: boolean;
    error: string | null;

    setApiKey: (key: string) => void;
    setReportCode: (code: string) => void;
    setFightId: (id: string) => void;
    setReportAndFightFromUrl: (url: string) => void;
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
            reportCode: '',
            fightId: '',
            fight: null,
            actors: [],
            bossIds: [],
            selectedJob: 'GNB',
            selectedPlayerId: null,
            selectedMitIds: [],
            damageEvents: [],
            castEvents: [],
            mitEvents: [],
            isLoading: false,
            isRendering: false,
            error: null,

            setApiKey: (key) => set({ apiKey: key }),
            setReportCode: (code) => set({ reportCode: code }),
            setFightId: (id) => set({ fightId: id }),
            setReportAndFightFromUrl: (url) => {
                const parsed = parseFFLogsUrl(url);
                if (parsed) {
                    set({ reportCode: parsed.reportCode, fightId: parsed.fightId });
                } else {
                    // Optionally set an error state here if the URL is invalid
                    console.error('Invalid FFLogs URL:', url);
                }
            },
            setSelectedJob: (job) => set({ selectedJob: job }),
            setSelectedPlayerId: (id) => set({ selectedPlayerId: id }),
            setSelectedMitIds: (ids) => set({ selectedMitIds: ids }),
            setIsRendering: (is) => set({ isRendering: is }),

            loadFightMetadata: async () => {
                const { apiKey, reportCode, fightId } = get();
                if (!apiKey || !reportCode) {
                    set({ error: '缺少输入' });
                    return;
                }

                set({ isLoading: true, error: null });
                try {
                    const report = await fetchReport(reportCode, apiKey);

                    let fightMeta;
                    if (fightId === 'last') {
                        // Find the last fight in the report
                        fightMeta = report.fights[report.fights.length - 1]
                    } else {
                        // Normal case: find fight by ID
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
                        .filter((f) => f.type !== 'LimitBreak' && f.type !== 'Environment') // 基础过滤
                        .map((f) => ({
                            id: f.id,
                            name: f.name,
                            type: f.type,
                            subType: f.type, // 简化
                        }));

                    // 存储相关的 Boss ID
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
                const { apiKey, reportCode, fight, selectedPlayerId, selectedJob, bossIds } = get();
                if (!apiKey || !reportCode || !fight || !selectedPlayerId) return;

                // 设置 rendering 为 true，直到 Timeline 组件通知渲染完成
                set({ isLoading: true, isRendering: true, error: null });
                const client = new FFLogsClient(apiKey);

                try {
                    // 1. 获取伤害事件
                    const damagePromise = fetchOldEvents<DamageEvent>(
                        reportCode, apiKey, fight.id, 'damage-taken', fight.start, fight.end, selectedPlayerId
                    );

                    // 2. 获取友方施法事件 (根据固定技能列表过滤)
                    const allowedActionIds = new Set(
                        SKILLS
                            .filter(s => s.job === selectedJob || s.job === 'ALL')
                            .map(s => s.actionId)
                            .filter((id): id is number => !!id)
                    );

                    const friendlyCastsPromise = client.fetchEvents(
                        reportCode, fight.start, fight.end, selectedPlayerId, false
                    ).then(events => FFLogsProcessor.processFriendlyEvents(events, fight.start, allowedActionIds));

                    // 3. 获取敌方施法事件 (获取所有检测到的 Boss)
                    const enemyCastsPromises = bossIds.map(bossId =>
                        client.fetchEvents(reportCode, fight.start, fight.end, bossId, true)
                    );

                    const [damages, friendlyCasts, enemyCastsMatrix] = await Promise.all([
                        damagePromise,
                        friendlyCastsPromise,
                        Promise.all(enemyCastsPromises)
                    ]);

                    const flatEnemyEvents = enemyCastsMatrix.flat();
                    const processedEnemyCasts = FFLogsProcessor.processEnemyEvents(flatEnemyEvents, fight.start);

                    // 转换为内部格式

                    // A. 友方施法 -> 减伤事件 (mitEvents)
                    const newMitEvents: MitEvent[] = friendlyCasts.map((e): MitEvent | null => {
                        // 查找对应的 Skill 定义以获取 durationSec
                        const skillDef = SKILLS.find(s => s.actionId === e.actionId);
                        if (!skillDef) return null;

                        const tStartMs = e.time * 1000;
                        const durationMs = skillDef.durationSec * 1000;

                        return {
                            id: crypto.randomUUID(),
                            skillId: skillDef.id,
                            tStartMs: tStartMs,
                            durationMs: durationMs,
                            tEndMs: tStartMs + durationMs
                        };
                    }).filter((e): e is MitEvent => !!e);

                    // B. 敌方施法 -> 读条列表 (castEvents)
                    const finalCasts: CastEvent[] = processedEnemyCasts.map(e => ({
                        timestamp: fight.start + (e.time * 1000),
                        tMs: e.time * 1000,
                        type: e.type,
                        sourceID: e.sourceID,
                        targetID: 0,
                        ability: { guid: e.actionId, name: e.actionName, type: 0 },
                        originalActionId: e.actionId,
                        isBossEvent: true,
                        isFriendly: false,
                        originalType: e.type as 'cast' | 'begincast',
                        duration: e.duration // 确保传递 duration
                    })).sort((a, b) => a.tMs - b.tMs);


                    // --- 处理伤害事件合并逻辑: packetID为唯一标识 ---
                    const processTimestamp = (e: DamageEvent): DamageEvent => ({ ...e, tMs: e.timestamp - fight.start });
                    const dict = new Map<number, { calc?: DamageEvent, dmg?: DamageEvent }>();
                    const standaloneEvents: DamageEvent[] = [];

                    damages.forEach(e => {
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
                                standaloneEvents.push({ ...e, ability: { ...e.ability, name: `? ${e.ability.name}` } });
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
                                type: 'damage-combined'
                            });
                        } else if (calc) {
                            combinedDamages.push({
                                ...calc,
                                ability: { ...calc.ability, name: `? ${calc.ability.name}` }
                            });
                        } else if (dmg) {
                            combinedDamages.push({
                                ...dmg,
                                ability: { ...dmg.ability, name: `* ${dmg.ability.name}` }
                            });
                        }
                    }

                    const finalDamages = [...standaloneEvents, ...combinedDamages].sort((a, b) => a.timestamp - b.timestamp);

                    set({
                        damageEvents: finalDamages.map(processTimestamp),
                        castEvents: finalCasts,
                        mitEvents: newMitEvents, // 更新减伤事件
                        isLoading: false
                        // 注意: isRendering 仍然为 true，直到 Timeline 组件通知渲染完成
                    });
                } catch (err: unknown) {
                    console.error(err);
                    const msg = err instanceof Error ? err.message : String(err);
                    set({ error: msg || '加载事件失败', isLoading: false, isRendering: false });
                }
            },

            addMitEvent: (event) => set((state) => ({ mitEvents: [...state.mitEvents, event] })),
            updateMitEvent: (id, updates) =>
                set((state) => ({
                    mitEvents: state.mitEvents.map((e) => (e.id === id ? { ...e, ...updates } : e)),
                })),
            removeMitEvent: (id) =>
                set((state) => ({ mitEvents: state.mitEvents.filter((e) => e.id !== id) })),
            setMitEvents: (events) => set({ mitEvents: events }),
        }),
        {
            name: 'xiv-mit-composer-storage',
            partialize: (state) => ({
                apiKey: state.apiKey,
                reportCode: state.reportCode,
                fightId: state.fightId,
                selectedJob: state.selectedJob,
                selectedPlayerId: state.selectedPlayerId,
                mitEvents: state.mitEvents,
            }),
        }
    )
);
