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
  const dragId = `new-${skill.id}-${ownerJob ?? 'ALL'}`;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId, // 双T时需要按职业区分，避免角色通用技能ID冲突
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
      <SkillCard skill={skill} job={jobOverride} />
    </div>
  );
}
