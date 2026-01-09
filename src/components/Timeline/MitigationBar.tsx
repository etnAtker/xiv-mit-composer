import type { MitEvent } from '../../model/types';
import { SKILLS } from '../../data/skills';
import { cn } from '../../utils';

interface Props {
    mit: MitEvent;
    width: number; // 精确像素宽度
    className?: string;
    isSelected?: boolean;
    onClick?: (mit: MitEvent, e: React.MouseEvent) => void;
    onRightClick?: (e: React.MouseEvent, mit: MitEvent) => void;
    // 仅用于展示，无需拖拽处理
    isOverlay?: boolean;
}

export function MitigationBar({ mit, width, className, isSelected, onClick, onRightClick, isOverlay }: Props) {
    const skill = SKILLS.find(s => s.id === mit.skillId);

    return (
        <div
            style={{ width }}
            className={cn(
                "rounded shadow-md border border-white/20 overflow-hidden flex items-center justify-center text-xs font-bold text-white relative h-full cursor-pointer",
                skill?.color || 'bg-gray-500',
                className,
                isOverlay && "opacity-80 ring-2 ring-white z-50 shadow-xl",
                isSelected && "ring-2 ring-yellow-400 z-50"
            )}
            onClick={(e) => onClick && onClick(mit, e)}
            onContextMenu={(e) => {
                e.preventDefault();
                if (onRightClick) {
                    onRightClick(e, mit);
                }
            }}
        >
            <span className="truncate px-1">{skill?.name}</span>
        </div>
    );
}
