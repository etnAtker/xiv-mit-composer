import { useDraggable } from '@dnd-kit/core';
import type { MitEvent } from '../../model/types';
import { useRef } from 'react';
import { MitigationBar } from './MitigationBar';
import { MS_PER_SEC, TIME_DECIMAL_PLACES } from '../../constants/time';

interface Props {
    mit: MitEvent;
    left: number;
    width: number;
    onUpdate: (id: string, updates: Partial<MitEvent>) => void;
    onRemove: (id: string) => void;
    isEditing: boolean;
    onEditChange: (isEditing: boolean) => void;
    isSelected?: boolean;
    onSelect?: (mit: MitEvent, e: React.MouseEvent) => void;
    onRightClick?: (e: React.MouseEvent, mit: MitEvent) => void;
}

export function DraggableMitigation({ mit, left, width, onUpdate, onRemove, isEditing, onEditChange, isSelected, onSelect, onRightClick }: Props) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: mit.id,
        data: { type: 'existing-mit', mit }
    });

    // 拖拽时隐藏原条，使用覆盖层显示拖拽中的条目

    const style = {
        left: left,
        width: width,
        position: 'absolute' as const,
        height: '100%',
        top: 0,
        pointerEvents: 'auto' as const
    };

    const editInputRef = useRef<HTMLInputElement>(null);

    const handleEditSubmit = () => {
        onEditChange(false);
        const rawValue = editInputRef.current?.value ?? '';
        const val = parseFloat(rawValue);
        if (!isNaN(val)) {
            onUpdate(mit.id, {
                tStartMs: val * MS_PER_SEC,
                tEndMs: (val * MS_PER_SEC) + mit.durationMs
            });
        }
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="group"
            onContextMenu={(e) => {
                // 优先使用外部右键处理
                if (onRightClick) {
                    onRightClick(e, mit);
                }
            }}
        >
            <div
                {...attributes}
                {...listeners}
                className={isDragging ? 'opacity-0' : 'h-full w-full'}
            >
                {!isDragging && (
                    <MitigationBar
                        mit={mit}
                        width={width}
                        isSelected={isSelected}
                        onClick={(mit, e) => onSelect && onSelect(mit, e)}
                        onRightClick={(e, mit) => onRightClick && onRightClick(e, mit)}
                    />
                )}
            </div>

            {/* 编辑态表单 */}
            {
                !isDragging && isEditing && (
                    <div
                        className="absolute top-full mt-1 left-0 bg-gray-800 border border-gray-600 p-3 rounded z-[100] w-auto min-w-[140px] shadow-xl flex flex-col gap-2"
                        onPointerDown={e => e.stopPropagation()}
                    >
                        <label className="text-xs text-gray-400 font-bold">编辑事件</label>

                        <div className="flex items-center gap-2">
                            <label className="text-[10px] text-gray-500 whitespace-nowrap">开始(s):</label>
                            <input
                                autoFocus
                                className="w-16 bg-gray-700 border border-gray-500 rounded text-xs px-2 py-1 text-white focus:border-blue-500 outline-none"
                                ref={editInputRef}
                                defaultValue={(mit.tStartMs / MS_PER_SEC).toFixed(TIME_DECIMAL_PLACES)}
                                onKeyDown={e => e.key === 'Enter' && handleEditSubmit()}
                            />
                        </div>

                        <div className="flex justify-between items-center mt-1 border-t border-gray-700 pt-2">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onRemove(mit.id);
                                }}
                                className="text-red-400 hover:text-red-300 text-xs flex items-center gap-1 px-2 py-1 rounded hover:bg-red-900/30 transition-colors"
                            >
                                <span>🗑️</span> 删除
                            </button>

                            <button
                                onClick={handleEditSubmit}
                                className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1 rounded transition-colors"
                            >
                                确定
                            </button>
                        </div>
                    </div>
                )}
        </div>
    );
}
