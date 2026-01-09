import { useDraggable } from '@dnd-kit/core';
import type { MitEvent } from '../../model/types';
import { useState, useEffect } from 'react';
import { MitigationBar } from './MitigationBar';
import { ContextMenu } from './ContextMenu';

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

    // 可拖拽元素本身是在时间轴中看到的元素。
    // 如果使用 DragOverlay，我们需要在拖拽时隐藏此元素。
    // 为了保持一致性，我们依赖 Overlay 进行展示。

    const style = {
        left: left,
        width: width,
        position: 'absolute' as const,
        height: '100%',
        top: 0,
        pointerEvents: 'auto' as const
    };

    const [editValue, setEditValue] = useState((mit.tStartMs / 1000).toFixed(1));
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

    // Close context menu when clicking outside
    useEffect(() => {
        if (!contextMenu) return;

        const handleClickOutside = () => {
            setContextMenu(null);
        };

        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, [contextMenu]);

    // 当进入编辑模式时，同步当前时间
    useEffect(() => {
        if (isEditing) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setEditValue((mit.tStartMs / 1000).toFixed(1));
        }
    }, [isEditing, mit.tStartMs]);

    const handleEditSubmit = () => {
        onEditChange(false);
        const val = parseFloat(editValue);
        if (!isNaN(val)) {
            onUpdate(mit.id, {
                tStartMs: val * 1000,
                tEndMs: (val * 1000) + mit.durationMs
            });
        }
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY });
    };

    const handleEditClick = () => {
        setContextMenu(null);
        onEditChange(true);
    };

    const handleRemoveClick = () => {
        setContextMenu(null);
        onRemove(mit.id);
    };

    const handleContextMenuClose = () => {
        setContextMenu(null);
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="group"
            onContextMenu={(e) => {
                // If onRightClick is provided (new selection system), use that instead of the default context menu
                if (onRightClick) {
                    onRightClick(e, mit);
                } else {
                    handleContextMenu(e);
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

            {/* Context menu for editing */}
            {
                !isDragging && contextMenu && (
                    <ContextMenu
                        items={[
                            {
                                label: '编辑事件',
                                onClick: handleEditClick
                            },
                            {
                                label: '删除事件',
                                onClick: handleRemoveClick,
                                danger: true
                            }
                        ]}
                        position={contextMenu}
                        onClose={handleContextMenuClose}
                    />
                )
            }

            {/* Edit form when in edit mode */}
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
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
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
