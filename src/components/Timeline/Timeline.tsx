import React, { useRef, useMemo, memo, useEffect, useState, useCallback } from 'react';
import { useStore } from '../../store';
import { useDroppable } from '@dnd-kit/core';
import { format } from 'date-fns';
import { SKILLS } from '../../data/skills';
import type { CastEvent, DamageEvent, MitEvent } from '../../model/types';
import { DraggableMitigation } from './DraggableMitigation';
import { ContextMenu } from './ContextMenu';

// 估算文本宽度：字符数 × 平均宽度
const CHAR_W = 7; // 字号约 12 时的单字符像素宽度

// 标签文本最大长度（约 8 个汉字）
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

// 根据事件类型选择颜色
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

// 按像素间距聚类事件
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
                endX // 记录最后一个事件的像素位置
            });
            currentCluster = [ev];
            startX = x;
            endX = x;
        }
    }
    clusters.push({ events: currentCluster, startX, endX });
    return clusters;
}

const getVisibleClusters = <T extends { tMs: number }>(
    events: T[],
    zoom: number,
    visibleRange: { start: number, end: number },
    gap: number
) => {
    const visible = events.filter(e => e.tMs >= visibleRange.start - 2000 && e.tMs <= visibleRange.end + 2000);
    return clusterEvents(visible, zoom, gap);
};

/** 性能优化：独立的施法泳道组件，避免父组件重渲染导致整体重绘 */
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
    // 按可视范围聚类
    const visibleClusters = useMemo(() => {
        return getVisibleClusters(events, zoom, visibleRange, 15);
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

                // 扩大点击区域，覆盖倾斜标签
                const hitX = cluster.startX - 5;
                const hitW = Math.max((cluster.endX - cluster.startX) + 15, 60);

                return (
                    <g key={`c-${cIdx}`}>
                        {/* 绘制聚类内的所有事件 */}
                        {cluster.events.map((ev, idx) => {
                            const x = (ev.tMs / 1000) * zoom;
                            const color = getCastColor(ev.type);
                            return (
                                <rect
                                    key={`e-${idx}`}
                                    x={x} y={0}
                                    width={Math.max(2, (ev.duration || 0) / 1000 * zoom)}
                                    height={height}
                                    fill={color} // 用颜色区分读条类型
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
                            height={height + 50} // 向下延伸覆盖标签
                            fill="transparent"
                            style={{ pointerEvents: 'all', cursor: 'help' }}
                            onMouseEnter={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                // 将提示锚定到条形图中心
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

/** 性能优化：独立的承伤泳道组件 */
const DamageLane = memo(({
    events,
    mitEvents,
    zoom,
    height,
    top,
    visibleRange,
    onHover,
    lineHeight
}: {
    events: DamageEvent[],
    mitEvents: MitEvent[],
    zoom: number,
    height: number,
    top: number,
    visibleRange: { start: number, end: number },
    onHover: (data: TooltipData | null) => void,
    lineHeight: number
}) => {
    // 按可视范围聚类
    const visibleClusters = useMemo(() => {
        return getVisibleClusters(events, zoom, visibleRange, 18);
    }, [events, visibleRange, zoom]);

    return (
        <g transform={`translate(0, ${top})`}>
            <text x={10} y={-5} fill="#9CA3AF" fontSize={12} fontWeight="bold">承伤 (Damage)</text>

            {visibleClusters.map((cluster, cIdx) => {
                const firstEv = cluster.events[0];
                const count = cluster.events.length;

                // 只要存在未覆盖事件就标红
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
                        {/* 竖向引导线 */}
                        <line x1={cluster.startX} y1={-20} x2={cluster.startX} y2={lineHeight} stroke={color} strokeWidth={2} strokeDasharray="3 3" opacity={0.5} />

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
                                // 将提示锚定到条形图中心
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

    // 框选状态
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

    // 渲染完成后取消遮罩
    useEffect(() => {
        // 延迟一帧，确保渲染完成
        const timer = setTimeout(() => {
            setIsRendering(false);
        }, 300);
        return () => clearTimeout(timer);
    }, [mitEvents, damageEvents, castEvents, setIsRendering]);

    // 点击空白处时关闭菜单并清空选择
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const contextMenuElement = document.querySelector(`[data-context-menu-id="${selectedMitIds.join(',')}"]`);
            if (contextMenuElement && !contextMenuElement.contains(e.target as Node)) {
                setContextMenu(null);
                setSelectedMitIds([]);
            }
        };

        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, [contextMenu, selectedMitIds, setSelectedMitIds]);

    // 减伤泳道的可放置区域
    const { setNodeRef: setMitLaneRef } = useDroppable({
        id: 'mit-lane',
        data: { type: 'lane' }
    });

    const scrollRef = useRef<HTMLDivElement>(null);

    // 可视范围状态
    const [visibleRange, setVisibleRange] = useState({ start: 0, end: 10000 }); // 初始显示前 10 秒

    // 滚动处理
    const handleScroll = useCallback(() => {
        if (!scrollRef.current) return;
        const { scrollLeft, clientWidth } = scrollRef.current;

        const startSec = scrollLeft / zoom;
        const endSec = (scrollLeft + clientWidth) / zoom;

        // 转换为毫秒并增加缓冲区
        const buffer = 5000; // 5 秒缓冲区
        const newStart = Math.max(0, (startSec * 1000) - buffer);
        const newEnd = (endSec * 1000) + buffer;

        // 变化小于 1 秒时不更新
        setVisibleRange(prev => {
            if (Math.abs(prev.start - newStart) < 1000 && Math.abs(prev.end - newEnd) < 1000) {
                return prev;
            }
            return { start: newStart, end: newEnd };
        });
    }, [zoom]);

    // 初始化/缩放变化时更新视窗
    useEffect(() => {
        handleScroll();
    }, [zoom, handleScroll]);

    // 预计算技能分行
    const { rowMap, totalRowHeight } = useMemo(() => {
        if (!mitEvents.length) return { rowMap: {}, totalRowHeight: 60 };

        // 统计当前用到的技能 ID
        const skillIds = Array.from(new Set(mitEvents.map(m => m.skillId)));

        // 为每个技能分配一行
        const ROW_HEIGHT = 40;
        const rowMap: Record<string, number> = {};
        skillIds.forEach((sid, index) => {
            rowMap[sid] = index;
        });

        return {
            rowMap,
            totalRowHeight: Math.max(60, skillIds.length * ROW_HEIGHT)
        };
    }, [mitEvents]); // mitEvents 变化时重新计算布局

    // 计算 CD 区域
    const cdZones = useMemo(() => {
        if (!mitEvents.length) return [];
        const zones: React.ReactElement[] = [];

        // 按技能分组
        const bySkill: Record<string, MitEvent[]> = {};
        mitEvents.forEach(m => {
            // 跳过正在拖拽的事件，避免显示旧 CD
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
                const width = skillDef.cooldownSec * zoom; // CD 区域长度

                // 绘制 CD 区域
                zones.push(
                    <g key={`cd-${ev.id}`} transform={`translate(${startX}, ${rowY})`}>
                        {/* CD 区域背景 */}
                        <rect x={0} y={5} width={width} height={30} fill="url(#diagonalHatch)" opacity={0.3} />
                        {/* 底部细线用于标识 CD */}
                        <line x1={0} y1={35} x2={width} y2={35} stroke="#EF4444" strokeWidth={2} opacity={0.6} />
                        <text x={5} y={30} fill="#6B7280" fontSize={9} className="select-none pointer-events-none">CD</text>
                    </g>
                );
            });
        });

        return zones;
    }, [mitEvents, zoom, rowMap, activeDragId]);

    // 动态布局计算
    const { castGap, dmgGap } = useMemo(() => {
        // 读条泳道：TRUNCATE_LEN + "..."
        const castMaxLenPx = (TRUNCATE_LEN + 3) * CHAR_W + 20;
        const castExtraH = castMaxLenPx * 0.707; // ~88px

        // 承伤泳道：伤害数值 + 技能名 + "..."
        const dmgMaxLenPx = (5 + TRUNCATE_LEN + 5 + 3) * CHAR_W + 20;
        const dmgExtraH = dmgMaxLenPx * 0.707; // ~130px

        return {
            castGap: Math.max(50, castExtraH),
            dmgGap: Math.max(80, dmgExtraH)
        };

    }, []); // 固定参数，无需依赖

    // 工具提示状态
    const [tooltip, setTooltip] = useState<TooltipData | null>(null);

    // 输入框的本地缩放状态
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
    const CAST_H = 60; // 施法泳道内容高度

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
                <div
                    style={{ width: totalWidth, height: TOTAL_SVG_HEIGHT, position: 'relative' }}
                    onMouseDown={(e) => {
                        // 只在空白区域开始框选
                        if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === 'svg' || (e.target as HTMLElement).id === containerId) {
                            e.preventDefault(); // 防止选中文本
                            setContextMenu(null);
                            setEditingMitId(null);

                            // 记录框选起点
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

                            // 鼠标移动时更新框选
                            const handleWindowMouseMove = (wEvent: MouseEvent) => {
                                const currentRect = containerEl.getBoundingClientRect();
                                setBoxSelection(prev => ({
                                    ...prev,
                                    endX: wEvent.clientX - currentRect.left,
                                    endY: wEvent.clientY - currentRect.top
                                }));
                            };

                            // 鼠标抬起后结算选中项
                            const handleWindowMouseUp = (wEvent: MouseEvent) => {
                                window.removeEventListener('mousemove', handleWindowMouseMove);
                                window.removeEventListener('mouseup', handleWindowMouseUp);

                                const currentRect = containerEl.getBoundingClientRect();
                                const endX = wEvent.clientX - currentRect.left;
                                const endY = wEvent.clientY - currentRect.top;

                                setBoxSelection(prev => {
                                    const finalSelection = {
                                        isActive: false,
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

                                    const newlySelectedIds: string[] = [];
                                    mitEvents.forEach(mit => {
                                        const left = (mit.tStartMs / 1000) * zoom;
                                        const width = (mit.durationMs / 1000) * zoom;
                                        const rowIndex = rowMap[mit.skillId] ?? 0;
                                        // 以容器为基准计算 y 坐标
                                        const top = MIT_Y + (rowIndex * 40);
                                        const height = 32;

                                        if (
                                            left >= selectionRect.left &&
                                            left + width <= selectionRect.right &&
                                            top >= selectionRect.top &&
                                            top + height <= selectionRect.bottom
                                        ) {
                                            newlySelectedIds.push(mit.id);
                                        }
                                    });

                                    if (wEvent.ctrlKey || wEvent.metaKey) {
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
                    {/* 框选遮罩 */}
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
                        <DamageLane
                            events={damageEvents}
                            mitEvents={mitEvents}
                            zoom={zoom}
                            height={60}
                            top={DMG_Y}
                            visibleRange={visibleRange}
                            onHover={setTooltip}
                            lineHeight={(MIT_Y - DMG_Y) + MIT_AREA_H}
                        />

                        {/* 减伤区标题 */}
                        <text x={10} y={MIT_Y - 5} fill="#9CA3AF" fontSize={12} fontWeight="bold">减伤 (Mitigation)</text>

                        {/* CD 区域层（减伤泳道位置） */}
                        <g transform={`translate(0, ${MIT_Y})`}>
                            {cdZones}
                        </g>

                    </svg>

                    {/* 减伤条覆盖层 */}
                    <div
                        id={containerId}
                        ref={setMitLaneRef}
                        className="absolute left-0 w-full"
                        style={{ top: MIT_Y, height: MIT_AREA_H }}


                    >
                        {mitEvents.map(mit => {
                            const isSelected = selectedMitIds.includes(mit.id);
                            // 选中且非当前拖拽项时，应用视觉偏移
                            const visualOffsetMs = (isSelected && mit.id !== activeDragId) ? dragDeltaMs : 0;

                            const left = ((mit.tStartMs + visualOffsetMs) / 1000) * zoom;
                            const width = (mit.durationMs / 1000) * zoom;

                            // 每个技能一行
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
                                            // Ctrl/Cmd 进行多选
                                            if (e.ctrlKey || e.metaKey) {
                                                if (selectedMitIds.includes(mit.id)) {
                                                    setSelectedMitIds(selectedMitIds.filter(id => id !== mit.id));
                                                } else {
                                                    setSelectedMitIds([...selectedMitIds, mit.id]);
                                                }
                                            } else {
                                                // 单选
                                                setSelectedMitIds([mit.id]);
                                                // 切换选中项时退出编辑态
                                                if (editingMitId && editingMitId !== mit.id) {
                                                    setEditingMitId(null);
                                                }
                                            }
                                            setContextMenu(null);
                                        }}
                                        onRightClick={(e, mit) => {
                                            e.stopPropagation();
                                            // 右键前先保证当前项已选中
                                            if (!selectedMitIds.includes(mit.id)) {
                                                setSelectedMitIds([mit.id]);
                                            }
                                            // 打开右键菜单时退出编辑态
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

            {/* 选中条目的右键菜单 */}
            {contextMenu && selectedMitIds.length > 0 && (
                <ContextMenu
                    items={[
                        ...(selectedMitIds.length === 1 ? [{
                            label: '编辑事件',
                            onClick: () => {
                                setEditingMitId(selectedMitIds[0]);
                                setContextMenu(null);
                            }
                        }] : []),
                        {
                            label: selectedMitIds.length === 1 ? '删除' : `删除所选项 (${selectedMitIds.length})`,
                            onClick: () => {
                                selectedMitIds.forEach(id => removeMitEvent(id));
                                setContextMenu(null);
                                setSelectedMitIds([]);
                            },
                            danger: true
                        }
                    ]}
                    position={contextMenu}
                    onClose={() => setContextMenu(null)}
                />
            )}

            {/* 工具提示覆盖层 */}
            {
                tooltip && (
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
                )
            }
        </div >
    );
}
