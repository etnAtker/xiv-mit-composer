import { useDraggable } from '@dnd-kit/core';
import type { Job, Skill } from '../../model/types';
import { SkillCard } from './SkillCard';
import { cn } from '../../utils';

interface Props {
  skill: Skill;
  jobOverride?: Job;
}

export function DraggableSkill({ skill, jobOverride }: Props) {
  const ownerJob = jobOverride ?? (skill.job !== 'ALL' ? skill.job : undefined);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `new-${skill.id}`, // 与减伤事件区分的唯一 ID
    data: { type: 'new-skill', skill, ownerJob },
  });

  // 拖拽时降低原卡片透明度，避免与覆盖层重叠
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn('touch-none', isDragging ? 'opacity-30' : '')}
    >
      <SkillCard skill={skill} />
    </div>
  );
}
