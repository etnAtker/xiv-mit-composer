import { useDraggable } from '@dnd-kit/core';
import type { Skill } from '../model/types';
import { SkillCard } from './SkillCard';
import { cn } from '../utils';

interface Props {
    skill: Skill;
}

export function DraggableSkill({ skill }: Props) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `new-${skill.id}`, // 与减伤事件区分的唯一 ID
        data: { type: 'new-skill', skill }
    });

    // 拖拽时的样式处理：
    // 当元素被拖拽时，降低原元素的透明度，因为此时已显示 DragOverlay

    return (
        <div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            className={cn("touch-none", isDragging ? 'opacity-30' : '')}
        >
            <SkillCard skill={skill} />
        </div>
    );
}
