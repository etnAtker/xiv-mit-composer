import React, { useRef, useMemo, memo, useEffect, useState, useCallback } from 'react';
import { useStore } from '../../store';
import { useDroppable } from '@dnd-kit/core';
import { format } from 'date-fns';
import { SKILLS } from '../../data/skills';
import type { CastEvent, DamageEvent, MitEvent } from '../../model/types';

// 组件
import { DraggableMitigation } from './DraggableMitigation';

// 估算文本宽度的辅助函数 (字符数 * 平均宽度)
const CHAR_W = 7; // 字体大小 12 时每个字符的预估像素宽度

// 截断辅助函数：限制在大约 8 个中文字符的宽度（约 16 个 ASCII 字符）
const TRUNCATE_LEN = 12;

function truncateText(text: string, maxLength: number) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}


interface TooltipItem {
    title: string;
    subtitle: string;
    color?: string;
}

interface TooltipData {
    x: number;
    y: number;
    items: TooltipItem[];
}

// 根据事件类型获取颜色的辅助函数
const EVENT_COLORS = {
    cast: {
        begincast: '#60A5FA', // 蓝色
        default: '#A78BFA',   // 紫色
    },
    damage: {
        mitigated: '#34D399', // 绿色
        unmitigated: '#F87171', // 红色
        text: '#9CA3AF' // 灰色
    }
};

const getCastColor = (type: string) =>
    type === 'begincast' ? EVENT_COLORS.cast.begincast : EVENT_COLORS.cast.default;

const getDamageColor = (isMitigated: boolean) =>
    isMitigated ? EVENT_COLORS.damage.mitigated : EVENT_COLORS.damage.unmitigated;

// 聚类辅助函数
function clusterEvents<T extends { tMs: number }>(events: T[], zoom: number, gap: number = 15) {
    const clusters: { events: T[], startX: number, endX: number }[] = [];
    if (!events.length) return clusters;

    let currentCluster: T[] = [events[0]];
    let startX = (events[0].tMs / 1000) * zoom;
    let endX = startX;

    for (let i = 1; i < events.length; i++) {
        const ev = events[i];
        const x = (ev.tMs / 1000) * zoom;

        if (x - endX < gap) {
            currentCluster.push(ev);
            endX = x;
        } else {
            clusters.push({
                events: currentCluster,
                startX,
                endX // 最后一个项目的位置（目前聚类时忽略持续时间）
            });
            currentCluster = [ev];
            startX = x;
            endX = x;
        }
    }
    clusters.push({ events: currentCluster, startX, endX });
    return clusters;
}

/** 性能优化：独立的 Cast Lane 组件，避免父组件重渲染导致全部重绘 */
const CastLane = memo(({
    events,
    zoom,
    height,
    top,
    visibleRange,
    onHover
}: {
    events: CastEvent[],
    zoom: number,
    height: number,
    top: number,
    visibleRange: { start: number, end: number },
    onHover: (data: TooltipData | null) => void
}) => {
    // 虚拟化过滤 + 聚类
    const visibleClusters = useMemo(() => {
        const visible = events.filter(e => e.tMs >= visibleRange.start - 2000 && e.tMs <= visibleRange.end + 2000);
        return clusterEvents(visible, zoom, 15); // 15px 间隙阈值
    }, [events, visibleRange, zoom]);

    return (
        <g transform={`translate(0, ${top})`}>
            <text x={10} y={-5} fill="#9CA3AF" fontSize={12} fontWeight="bold">读条 (Casts)</text>

            {visibleClusters.map((cluster, cIdx) => {
                const firstEv = cluster.events[0];
                const count = cluster.events.length;
                const labelText = count > 1
                    ? `${truncateText(firstEv.ability.name, TRUNCATE_LEN)} (+${count - 1})`
                    : truncateText(firstEv.ability.name, TRUNCATE_LEN);

                // 计算点击区域：覆盖聚类的特定矩形
                // 从 startX 到 endX + 最后一项周围的一些宽度 + 文本的额外宽度
                const hitX = cluster.startX - 5;
                // hitW 需要覆盖条形图和倾斜文本的大致长度 
                // 文本长度约 80-100px。
                const hitW = Math.max((cluster.endX - cluster.startX) + 15, 60);

                return (
                    <g key={`c-${cIdx}`}>
                        {/* 渲染聚类中所有事件的图形 */}
                        {cluster.events.map((ev, idx) => {
                            const x = (ev.tMs / 1000) * zoom;
                            const color = getCastColor(ev.type);
                            return (
                                <rect
                                    key={`e-${idx}`}
                                    x={x} y={0}
                                    width={Math.max(2, (ev.duration || 0) / 1000 * zoom)}
                                    height={height}
                                    fill={color} // 读条开始显示不同颜色
                                    opacity={0.6}
                                />
                            );
                        })}

                        {/* 合并后的标签 */}
                        <text
                            x={cluster.startX}
                            y={height + 12}
                            fill={getCastColor(cluster.events[0].type)}
                            fontSize={12}
                            style={{ textAnchor: 'start' }}
                            transform={`rotate(45, ${cluster.startX}, ${height + 12})`}
                            className="pointer-events-none select-none opacity-90 font-medium"
                        >
                            {labelText}
                        </text>

                        {/* 组合点击区域 */}
                        <rect
                            x={hitX}
                            y={0}
                            width={hitW}
                            height={height + 50} // 向下延伸以覆盖标签
                            fill="transparent"
                            style={{ pointerEvents: 'all', cursor: 'help' }}
                            onMouseEnter={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                // 将工具提示锚定到条形图中心，而不是点击区域
                                // hitX 是 startX - 5。所以 startX 是 rect.left + 5。
                                // 条形图中心 = startX + (endX - startX)/2
                                const barCenterOffset = 5 + (cluster.endX - cluster.startX) / 2;

                                onHover({
                                    x: rect.left + barCenterOffset,
                                    y: rect.top - 5,
                                    items: cluster.events.map(ev => ({
                                        title: ev.ability.name,
                                        subtitle: format(new Date(0, 0, 0, 0, 0, 0, ev.tMs), 'mm:ss.SS'),
                                        color: getCastColor(ev.type)
                                    }))
                                });
                            }}
                            onMouseLeave={() => onHover(null)}
                        />
                    </g>
                );
            })}
        </g>
    );
});

/** 性能优化：独立的 Damage Lane 组件 */
const DamageLane = memo(({
    events,
    mitEvents,
    zoom,
    height,
    top,
    visibleRange,
    onHover
}: {
    events: DamageEvent[],
    mitEvents: MitEvent[],
    zoom: number,
    height: number,
    top: number,
    visibleRange: { start: number, end: number },
    onHover: (data: TooltipData | null) => void
}) => {
    // 虚拟化过滤 + 聚类
    const visibleClusters = useMemo(() => {
        const visible = events.filter(e => e.tMs >= visibleRange.start - 2000 && e.tMs <= visibleRange.end + 2000);
        return clusterEvents(visible, zoom, 18); // 伤害间隔稍微大一点
    }, [events, visibleRange, zoom]);

    return (
        <g transform={`translate(0, ${top})`}>
            {/* <line x1={0} y1={height / 2} x2="100%" y2={height / 2} stroke="#4B5563" strokeWidth={1} /> */}
            <text x={10} y={-5} fill="#9CA3AF" fontSize={12} fontWeight="bold">承伤 (Damage)</text>

            {visibleClusters.map((cluster, cIdx) => {
                const firstEv = cluster.events[0];
                const count = cluster.events.length;

                // 颜色逻辑：如果有任何未覆盖 -> 红色。全部覆盖 -> 绿色？
                // 保持安全策略：如果有任何伤害（红色），则显示红色。
                const isCovered = cluster.events.some(ev => mitEvents.some(m => ev.tMs >= m.tStartMs && ev.tMs <= m.tEndMs));
                const color = getDamageColor(isCovered);

                const damageNumStr = (firstEv.unmitigatedAmount / 1000).toFixed(0)
                const damageStr = isNaN(Number(damageNumStr)) ? '???' : `${damageNumStr}k`

                const labelText = count > 1
                    ? `${damageStr} ${truncateText(firstEv.ability.name ? `(${firstEv.ability.name})` : '', TRUNCATE_LEN)} (+${count - 1})`
                    : `${damageStr} ${truncateText(firstEv.ability.name ? `(${firstEv.ability.name})` : '', TRUNCATE_LEN + 5)}`;

                const hitX = cluster.startX - 8;
                const hitW = Math.max((cluster.endX - cluster.startX) + 16, 60);

                return (
                    <g key={`c-${cIdx}`}>
                        <line x1={cluster.startX} y1={-20} x2={cluster.startX} y2={height} stroke={color} strokeWidth={1} strokeDasharray="2 2" opacity={0.3} />

                        {cluster.events.map((ev, idx) => {
                            const x = (ev.tMs / 1000) * zoom;
                            const isCovered = mitEvents.some(m => ev.tMs >= m.tStartMs && ev.tMs <= m.tEndMs);
                            const subColor = getDamageColor(isCovered);
                            return (
                                <circle
                                    key={`e-${idx}`}
                                    cx={x} cy={height / 2} r={4}
                                    fill={subColor}
                                    stroke="rgba(0,0,0,0.2)" strokeWidth={1}
                                />
                            );
                        })}

                        <text
                            x={cluster.startX}
                            y={height + 12}
                            fill={color}
                            fontSize={12}
                            textAnchor="start"
                            transform={`rotate(45, ${cluster.startX}, ${height + 12})`}
                            fontWeight="bold"
                            className="pointer-events-none select-none"
                        >
                            {labelText}
                        </text>

                        <rect
                            x={hitX}
                            y={0}
                            width={hitW}
                            height={height + 50}
                            fill="transparent"
                            style={{ pointerEvents: 'all', cursor: 'help' }}
                            onMouseEnter={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                // 锚定到条形图中心。hitX 是 startX - 8。
                                const barCenterOffset = 8 + (cluster.endX - cluster.startX) / 2;

                                onHover({
                                    x: rect.left + barCenterOffset,
                                    y: rect.top - 10,
                                    items: cluster.events.map(ev => ({
                                        title: `${(ev.unmitigatedAmount / 1000).toFixed(0)}k ${ev.ability.name}`,
                                        subtitle: format(new Date(0, 0, 0, 0, 0, 0, ev.tMs), 'mm:ss.SS'),
                                        color: getDamageColor(mitEvents.some(m => ev.tMs >= m.tStartMs && ev.tMs <= m.tEndMs))
                                    }))
                                });
                            }}
                            onMouseLeave={() => onHover(null)}
                        />
                    </g>
                );
            })}
        </g>
    );
});

interface TimelineProps {
    zoom: number;
    setZoom: (z: number) => void;
    containerId?: string;
    activeDragId?: string | null;
    dragDeltaMs?: number;
}

export function Timeline({ zoom, setZoom, containerId = 'mit-lane-container', activeDragId, dragDeltaMs = 0 }: TimelineProps) {
    const { fight, mitEvents, damageEvents, castEvents, updateMitEvent, removeMitEvent, setMitEvents, setIsRendering, selectedMitIds, setSelectedMitIds } = useStore();
    const [editingMitId, setEditingMitId] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

    // Box selection state
    const [boxSelection, setBoxSelection] = useState<{
        isActive: boolean;
        startX: number;
        startY: number;
        endX: number;
        endY: number;
    }>({
        isActive: false,
        startX: 0,
        startY: 0,
        endX: 0,
        endY: 0
    });

    // 渲染完成后通知 store 取消遮罩
    useEffect(() => {
        // 使用 setTimeout 让主线程有空隙完成渲染
        const timer = setTimeout(() => {
            setIsRendering(false);
        }, 300);
        return () => clearTimeout(timer);
    }, [mitEvents, damageEvents, castEvents, setIsRendering]);

    // Close context menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            // Check if the click is outside the context menu
            const contextMenuElement = document.querySelector(`[data-context-menu-id="${selectedMitIds.join(',')}"]`);
            if (contextMenuElement && !contextMenuElement.contains(e.target as Node)) {
                setContextMenu(null);
                setSelectedMitIds([]);
            }
        };

        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, [contextMenu, selectedMitIds, setSelectedMitIds]);

    // Mit Lane 的 Droppable 区域
    const { setNodeRef: setMitLaneRef } = useDroppable({
        id: 'mit-lane',
        data: { type: 'lane' }
    });

    const scrollRef = useRef<HTMLDivElement>(null);

    // 虚拟化状态
    const [visibleRange, setVisibleRange] = useState({ start: 0, end: 10000 }); // 初始先显示前10秒

    // 滚动处理
    const handleScroll = useCallback(() => {
        if (!scrollRef.current) return;
        const { scrollLeft, clientWidth } = scrollRef.current;

        const startSec = scrollLeft / zoom;
        const endSec = (scrollLeft + clientWidth) / zoom;

        // 转换为毫秒，并增加一些缓冲区 (左右各 ? 秒)
        // 只有当滚动超过一定阈值时才更新 state，避免频繁 render
        // 这里简化：每次都算，React 会处理 diff。如果性能慢，可以加 buffer 判断
        const buffer = 5000; // 5秒缓冲区
        const newStart = Math.max(0, (startSec * 1000) - buffer);
        const newEnd = (endSec * 1000) + buffer;

        // 简单的去重更新：只有变动超过 1s 才更新
        setVisibleRange(prev => {
            if (Math.abs(prev.start - newStart) < 1000 && Math.abs(prev.end - newEnd) < 1000) {
                return prev;
            }
            return { start: newStart, end: newEnd };
        });
    }, [zoom]);

    // 初始化/Zoom变化时更新视窗
    useEffect(() => {
        handleScroll();
    }, [zoom, handleScroll]);

    // 预计算行的逻辑
    const { rowMap, totalRowHeight } = useMemo(() => {
        if (!mitEvents.length) return { rowMap: {}, totalRowHeight: 60 };

        // 1. 找出所有用到的 skillId
        const skillIds = Array.from(new Set(mitEvents.map(m => m.skillId)));

        // 2. 为每个 skillId 分配一行
        const ROW_HEIGHT = 40;
        const rowMap: Record<string, number> = {};
        skillIds.forEach((sid, index) => {
            rowMap[sid] = index;
        });

        return {
            rowMap,
            totalRowHeight: Math.max(60, skillIds.length * ROW_HEIGHT)
        };
    }, [mitEvents]); // 依赖 mitEvents，每次变化都会重新计算布局

    // 计算 CD 区域
    const cdZones = useMemo(() => {
        if (!mitEvents.length) return [];
        const zones: React.ReactElement[] = [];

        // 按技能分组
        const bySkill: Record<string, MitEvent[]> = {};
        mitEvents.forEach(m => {
            // 跳过正在拖拽的事件，因为它的旧 CD 区域不再有效
            if (m.id === activeDragId) return;

            if (!bySkill[m.skillId]) bySkill[m.skillId] = [];
            bySkill[m.skillId].push(m);
        });

        Object.entries(bySkill).forEach(([skillId, events]) => {
            const skillDef = SKILLS.find(s => s.id === skillId);
            if (!skillDef || !skillDef.cooldownSec) return;

            const rowIndex = rowMap[skillId];
            if (rowIndex === undefined) return;

            const rowY = rowIndex * 40; // ROW_HEIGHT

            events.forEach(ev => {
                const startX = (ev.tStartMs / 1000) * zoom;
                const width = skillDef.cooldownSec * zoom; // 区域长度 = CD 持续时间

                // 绘制 CD 区域
                zones.push(
                    <g key={`cd-${ev.id}`} transform={`translate(${startX}, ${rowY})`}>
                        {/* CD区域背景，半透明 */}
                        <rect x={0} y={5} width={width} height={30} fill="url(#diagonalHatch)" opacity={0.3} />
                        {/* 底部细红线表示这是一段 CD */}
                        <line x1={0} y1={35} x2={width} y2={35} stroke="#EF4444" strokeWidth={2} opacity={0.6} />
                        <text x={5} y={30} fill="#6B7280" fontSize={9} className="select-none pointer-events-none">CD</text>
                    </g>
                );
            });
        });

        return zones;
    }, [mitEvents, zoom, rowMap, activeDragId]);

    // 动态布局计算 - 简化版，因为我们现在有了截断
    const { castGap, dmgGap } = useMemo(() => {
        // 由于我们截断文本，我们可以使用有界的每行最大高度

        // 读条泳道: TRUNCATE_LEN (12) + "..." (3) = 15 chars
        const castMaxLenPx = (TRUNCATE_LEN + 3) * CHAR_W + 20;
        const castExtraH = castMaxLenPx * 0.707; // ~88px

        // 承伤泳道: 伤害数值 (~5 chars) + TRUNCATE_LEN+5 (17) + "..." (3) = ~25 chars
        // 我们显著增加间隙以保持安全
        const dmgMaxLenPx = (5 + TRUNCATE_LEN + 5 + 3) * CHAR_W + 20;
        const dmgExtraH = dmgMaxLenPx * 0.707; // ~130px

        return {
            castGap: Math.max(50, castExtraH),
            dmgGap: Math.max(80, dmgExtraH)
        };

    }, []); // 不需要依赖，因为它现在是相对固定的

    // --- 工具提示状态 ---
    const [tooltip, setTooltip] = useState<TooltipData | null>(null);

    // --- 输入框的本地缩放状态 ---
    const [localZoom, setLocalZoom] = useState<string | number>(zoom);

    useEffect(() => {
        setLocalZoom(zoom);
    }, [zoom]);

    const commitZoom = () => {
        let val = typeof localZoom === 'string' ? parseInt(localZoom) : localZoom;
        if (isNaN(val)) val = 50;
        val = Math.max(10, Math.min(200, val));
        setZoom(val);
        setLocalZoom(val);
    };

    if (!fight) return null;

    const durationSec = fight.durationMs / 1000;
    const totalWidth = durationSec * zoom;

    // 泳道高度配置
    const RULER_H = 30;
    const CAST_H = 60; // 泳道内容区域的基础高度
    // 现在间隙需要容纳从上方泳道落下的倾斜文本

    // castGap 是 CastLane 下方的空间
    // dmgGap 是 DamageLane 下方的空间

    const CAST_Y = RULER_H + 20;
    const DMG_Y = CAST_Y + CAST_H + castGap;
    const MIT_Y = DMG_Y + 60 + dmgGap;

    const MIT_AREA_H = Math.max(100, totalRowHeight + 40);
    const TOTAL_SVG_HEIGHT = MIT_Y + MIT_AREA_H + 50;

    return (
        <div className="flex flex-col h-full bg-gray-950 relative">
            {/* 工具栏 */}
            <div className="flex items-center px-4 py-2 bg-gray-900 border-b border-gray-800 gap-3 shadow-sm z-10">
                <span className="text-xs text-gray-500 font-bold uppercase tracking-wider mr-2">时间轴缩放</span>

                <div className="flex items-center bg-gray-800 rounded-lg p-1 border border-gray-700">
                    <button
                        className="w-8 h-6 flex items-center justify-center bg-gray-700 hover:bg-gray-600 rounded text-gray-300 hover:text-white text-md transition-colors"
                        onClick={() => setZoom(Math.max(10, zoom - 10))}
                    >
                        -
                    </button>
                    <div className="flex items-center mx-1 relative">
                        <input
                            type="number"
                            value={localZoom}
                            onChange={(e) => setLocalZoom(e.target.value)}
                            onBlur={commitZoom}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    commitZoom();
                                    e.currentTarget.blur();
                                }
                            }}
                            className="w-12 h-6 bg-transparent text-center text-xs text-gray-300 font-mono focus:outline-none focus:bg-gray-700 rounded transition-colors appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <span className="text-xs text-gray-500 font-mono ml-1 select-none">px/s</span>
                    </div>
                    <button
                        className="w-8 h-6 flex items-center justify-center bg-gray-700 hover:bg-gray-600 rounded text-gray-300 hover:text-white text-md transition-colors"
                        onClick={() => setZoom(Math.min(200, zoom + 10))}
                    >
                        +
                    </button>
                </div>

                <div className="w-[1px] h-4 bg-gray-800 mx-2"></div>

                <button
                    className="px-3 py-1 bg-gray-800 border border-gray-700 hover:bg-gray-700 text-gray-300 hover:text-white rounded text-xs transition-colors"
                    onClick={() => setZoom(50)}
                >
                    重置视图
                </button>

                <button
                    className="px-3 py-1 bg-gray-800 border border-gray-700 hover:bg-red-900/50 text-red-400 hover:text-red-300 rounded text-xs transition-colors"
                    onClick={() => {
                        if (confirm('确定要清空所有已排的技能吗？此操作无法撤销。')) {
                            setMitEvents([]);
                        }
                    }}
                >
                    清空技能
                </button>
            </div>

            {/* 可滚动区域 */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-auto relative select-none custom-scrollbar bg-gray-950"
                onScroll={handleScroll}
                onWheel={(e) => {
                    // Alt + 滚轮缩放
                    if (e.altKey) {
                        e.preventDefault();
                        const delta = e.deltaY > 0 ? -5 : 5;
                        const newZoom = Math.max(10, Math.min(200, zoom + delta));
                        setZoom(newZoom);
                    }
                }}
            >

                {/* SVG 容器 */}
                <div style={{ width: totalWidth, height: TOTAL_SVG_HEIGHT, position: 'relative' }}>

                    <svg width={totalWidth} height={TOTAL_SVG_HEIGHT} className="absolute inset-0 block text-xs pointer-events-none">
                        <defs>
                            <pattern id="diagonalHatch" width="10" height="10" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
                                <line x1="0" y1="0" x2="0" y2="10" style={{ stroke: '#EF4444', strokeWidth: 1 }} />
                            </pattern>
                        </defs>

                        {/* 泳道背景色块 */}
                        <rect x={0} y={CAST_Y} width={totalWidth} height={CAST_H} fill="rgba(167, 139, 250, 0.05)" />
                        <rect x={0} y={DMG_Y} width={totalWidth} height={60} fill="rgba(248, 113, 113, 0.05)" />
                        <rect x={0} y={MIT_Y} width={totalWidth} height={MIT_AREA_H} fill="rgba(52, 211, 153, 0.02)" />

                        {/* 网格与标尺 */}
                        {Array.from({ length: Math.ceil(durationSec / 5) }).map((_, i) => {
                            const sec = i * 5;
                            const ms = sec * 1000;
                            if (ms < visibleRange.start - 5000 || ms > visibleRange.end + 5000) return null;

                            const x = sec * zoom;
                            return (
                                <g key={sec}>
                                    <line x1={x} y1={0} x2={x} y2={TOTAL_SVG_HEIGHT} stroke="#374151" strokeWidth={1} strokeDasharray="4 4" opacity={0.5} />
                                    <text x={x + 4} y={15} fill="#6B7280" fontSize={10} fontFamily="monospace">{format(new Date(0, 0, 0, 0, 0, sec), 'mm:ss')}</text>
                                </g>
                            );
                        })}

                        <CastLane events={castEvents} zoom={zoom} height={CAST_H} top={CAST_Y} visibleRange={visibleRange} onHover={setTooltip} />
                        <DamageLane events={damageEvents} mitEvents={mitEvents} zoom={zoom} height={60} top={DMG_Y} visibleRange={visibleRange} onHover={setTooltip} />

                        {/* 减伤区标题 */}
                        <text x={10} y={MIT_Y - 5} fill="#9CA3AF" fontSize={12} fontWeight="bold">减伤 (Mitigation)</text>

                        {/* CD 区域层 - 在减伤泳道 Y 位置渲染 */}
                        <g transform={`translate(0, ${MIT_Y})`}>
                            {cdZones}
                        </g>

                    </svg>

                    {/* 可拖拽元素 HTML 覆盖层 (减伤) */}
                    <div
                        id={containerId}
                        ref={setMitLaneRef}
                        className="absolute left-0 w-full"
                        style={{ top: MIT_Y, height: MIT_AREA_H }}
                        onMouseDown={(e) => {
                            // Only start box selection if clicking on the empty area, not on a mitigation bar
                            if (e.target === e.currentTarget) {
                                setContextMenu(null);
                                setEditingMitId(null);

                                // Start box selection
                                const containerEl = e.currentTarget;
                                const rect = containerEl.getBoundingClientRect();
                                const startX = e.clientX - rect.left;
                                const startY = e.clientY - rect.top;

                                setBoxSelection({
                                    isActive: true,
                                    startX,
                                    startY,
                                    endX: startX,
                                    endY: startY
                                });

                                // Global Mouse Move Handler
                                const handleWindowMouseMove = (wEvent: MouseEvent) => {
                                    // Calculate relative to the container using the cached rect is dangerous if container moves, 
                                    // but usually fine during a drag. Better to re-query container or use the captured one.
                                    // Let's re-query to be safe, or just use the cached rect if we assume no scrolling/layout shift during drag.
                                    // For simplicity and perf, we can use the cached rect or re-read client rect.
                                    // Since we are inside the closure, let's re-read only if necessary.
                                    // BUT, wait, e.currentTarget is null in async. 
                                    // We need to keep a reference to the element.
                                    const currentRect = containerEl.getBoundingClientRect();

                                    setBoxSelection(prev => ({
                                        ...prev,
                                        endX: wEvent.clientX - currentRect.left,
                                        endY: wEvent.clientY - currentRect.top
                                    }));
                                };

                                // Global Mouse Up Handler
                                const handleWindowMouseUp = (wEvent: MouseEvent) => {
                                    window.removeEventListener('mousemove', handleWindowMouseMove);
                                    window.removeEventListener('mouseup', handleWindowMouseUp);

                                    // Finish selection logic
                                    const currentRect = containerEl.getBoundingClientRect();
                                    // Use the LAST known BoxSelection state vs recalculating from event
                                    // Using the event data ensures we get the final release point
                                    const endX = wEvent.clientX - currentRect.left;
                                    const endY = wEvent.clientY - currentRect.top;

                                    setBoxSelection(prev => {
                                        const finalSelection = {
                                            isActive: false, // Turn off immediately for UI
                                            startX: prev.startX,
                                            startY: prev.startY,
                                            endX: endX,
                                            endY: endY
                                        };

                                        const selectionRect = {
                                            left: Math.min(finalSelection.startX, finalSelection.endX),
                                            top: Math.min(finalSelection.startY, finalSelection.endY),
                                            right: Math.max(finalSelection.startX, finalSelection.endX),
                                            bottom: Math.max(finalSelection.startY, finalSelection.endY)
                                        };

                                        // Find intersecting/contained items
                                        const newlySelectedIds: string[] = [];

                                        // We need access to 'mitEvents' here. 
                                        // Since we are using a closure defined in render/effect, we need to be careful about stale state?
                                        // Actually, if we define these functions INSIDE onMouseDown, they close over the current 'mitEvents'.
                                        // This is fine as long as mitEvents doesn't change *during* the drag (which it shouldn't normally).
                                        mitEvents.forEach(mit => {
                                            const left = (mit.tStartMs / 1000) * zoom; // Zoom also captured
                                            const width = (mit.durationMs / 1000) * zoom;
                                            const rowIndex = rowMap[mit.skillId] ?? 0;
                                            const top = rowIndex * 40;
                                            const height = 32;

                                            // Strict containment check
                                            if (
                                                left >= selectionRect.left &&
                                                left + width <= selectionRect.right &&
                                                top >= selectionRect.top &&
                                                top + height <= selectionRect.bottom
                                            ) {
                                                newlySelectedIds.push(mit.id);
                                            }
                                        });

                                        // Update selection
                                        if (wEvent.ctrlKey || wEvent.metaKey) {
                                            // Need functional update for setSelectedMitIds to get latest selectedMitIds?
                                            // No, selectedMitIds is also captured from the closure of the render that created this onMouseDown.
                                            // Ideally we use the setter callback pattern if we want to be safe against interleaved updates,
                                            // but for now simple invocation should be okay OR we can't easily mixing closure state and setter.
                                            // Actually, setSelectedMitIds((prev) => ...) is safe.
                                            // Use getState to ensure we have the latest selection when drag ends
                                            const currentSelected = useStore.getState().selectedMitIds;
                                            setSelectedMitIds([
                                                ...new Set([...currentSelected, ...newlySelectedIds])
                                            ]);
                                        } else {
                                            setSelectedMitIds(newlySelectedIds);
                                        }

                                        return {
                                            isActive: false,
                                            startX: 0,
                                            startY: 0,
                                            endX: 0,
                                            endY: 0
                                        };
                                    });
                                };

                                window.addEventListener('mousemove', handleWindowMouseMove);
                                window.addEventListener('mouseup', handleWindowMouseUp);
                            }
                        }}

                    >
                        {/* Box selection overlay */}
                        {boxSelection.isActive && (
                            <div
                                className="absolute border-2 border-dashed border-blue-400 bg-blue-400/10 z-50 pointer-events-none"
                                style={{
                                    left: Math.min(boxSelection.startX, boxSelection.endX),
                                    top: Math.min(boxSelection.startY, boxSelection.endY),
                                    width: Math.abs(boxSelection.endX - boxSelection.startX),
                                    height: Math.abs(boxSelection.endY - boxSelection.startY),
                                }}
                            />
                        )}

                        {mitEvents.map(mit => {
                            const isSelected = selectedMitIds.includes(mit.id);
                            // If this item is selected but NOT the one being actively dragged, apply the drag delta visually
                            const visualOffsetMs = (isSelected && mit.id !== activeDragId) ? dragDeltaMs : 0;

                            const left = ((mit.tStartMs + visualOffsetMs) / 1000) * zoom;
                            const width = (mit.durationMs / 1000) * zoom;

                            // 计算 top:
                            // 每一个 skillId 一行
                            const rowIndex = rowMap[mit.skillId] ?? 0;
                            const top = rowIndex * 40; // ROW_HEIGHT = 40

                            const isEditing = editingMitId === mit.id;
                            const zIndex = isEditing ? 100 : 10;

                            return (
                                <div
                                    key={mit.id}
                                    style={{ position: 'absolute', top, left: 0, width: '100%', height: 32, zIndex, pointerEvents: 'none' }}
                                    className={!isEditing ? "hover:z-20" : ""}
                                >
                                    <DraggableMitigation
                                        mit={mit}
                                        left={left}
                                        width={width}
                                        onUpdate={(id, update) => updateMitEvent(id, update)}
                                        onRemove={(id) => removeMitEvent(id)}
                                        isEditing={isEditing}
                                        onEditChange={(val) => setEditingMitId(val ? mit.id : null)}
                                        isSelected={selectedMitIds.includes(mit.id)}
                                        onSelect={(mit, e) => {
                                            // Handle multi-selection with Ctrl/Cmd key
                                            if (e.ctrlKey || e.metaKey) {
                                                // Toggle selection
                                                // Toggle selection
                                                if (selectedMitIds.includes(mit.id)) {
                                                    setSelectedMitIds(selectedMitIds.filter(id => id !== mit.id));
                                                } else {
                                                    setSelectedMitIds([...selectedMitIds, mit.id]);
                                                }
                                            } else {
                                                // Single selection
                                                setSelectedMitIds([mit.id]);
                                                // Close any editing state when selecting a different item
                                                if (editingMitId && editingMitId !== mit.id) {
                                                    setEditingMitId(null);
                                                }
                                            }
                                            setContextMenu(null);
                                        }}
                                        onRightClick={(e, mit) => {
                                            e.stopPropagation();
                                            // If this item is not in the selection, select it
                                            if (!selectedMitIds.includes(mit.id)) {
                                                setSelectedMitIds([mit.id]);
                                            }
                                            // Close any editing state when opening context menu
                                            if (editingMitId) {
                                                setEditingMitId(null);
                                            }
                                            setContextMenu({ x: e.clientX, y: e.clientY });
                                        }}
                                    />
                                </div>
                            );
                        })}
                    </div>

                </div>
            </div>

            {/* Selected Mitigation Bar Context Menu */}
            {contextMenu && selectedMitIds.length > 0 && (
                <div
                    className="fixed z-[9999] bg-gray-800 border border-gray-700 rounded shadow-lg py-1 min-w-[160px] max-w-xs"
                    style={{
                        left: contextMenu.x,
                        top: contextMenu.y,
                    }}
                    onClick={(e) => e.stopPropagation()}
                    data-context-menu-id={selectedMitIds.join(',')}
                >
                    <ul className="divide-y divide-gray-700">
                        {selectedMitIds.length === 1 ? (
                            <>
                                <li>
                                    <button
                                        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-700 transition-colors text-gray-200 hover:text-white"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingMitId(selectedMitIds[0]);
                                            setContextMenu(null);
                                        }}
                                    >
                                        编辑事件
                                    </button>
                                </li>
                                <li>
                                    <button
                                        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-700 transition-colors text-red-400 hover:text-red-300"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            // Remove the selected item
                                            removeMitEvent(selectedMitIds[0]);
                                            setContextMenu(null);
                                            setSelectedMitIds([]);
                                        }}
                                    >
                                        删除
                                    </button>
                                </li>
                            </>
                        ) : (
                            <li>
                                <button
                                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-700 transition-colors text-red-400 hover:text-red-300"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        // Remove all selected items
                                        selectedMitIds.forEach(id => {
                                            removeMitEvent(id);
                                        });
                                        setContextMenu(null);
                                        setSelectedMitIds([]);
                                    }}
                                >
                                    删除所选项 ({selectedMitIds.length})
                                </button>
                            </li>
                        )}
                    </ul>
                </div>
            )}

            {/* 工具提示 Portal/覆盖层 */}
            {tooltip && (
                <div
                    className="fixed z-[9999] pointer-events-none bg-gray-900/95 border border-gray-700 text-white text-xs rounded shadow-xl flex flex-col p-2 min-w-[120px]"
                    style={{
                        left: tooltip.x,
                        top: tooltip.y,
                        transform: 'translate(-50%, -100%)' // 居中显示在 x, y 上方
                    }}
                >
                    {tooltip.items.map((item, idx) => (
                        <div key={idx} className={`flex items-center justify-between gap-3 ${idx > 0 ? 'mt-1 border-t border-gray-700 pt-1' : ''}`}>
                            <span className="font-medium truncate flex-1 min-w-0 leading-none" style={{ color: item.color || '#F3F4F6' }}>
                                {item.title}
                            </span>
                            <span className="text-gray-400 font-mono text-[10px] whitespace-nowrap leading-none shrink-0">
                                {item.subtitle}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
