import { useDraggable } from '@dnd-kit/core';
import type { MitEvent } from '../../model/types';
import { getSkillDefinition } from '../../data/skills';
import { getSkillIconLocalSrc } from '../../data/icons';
import { MitigationBarContent } from './MitigationBar';
import { useTopBanner } from '../../hooks/useTopBanner';
import { MitigationEditPopover } from './MitigationEditPopover';

interface Props {
  mit: MitEvent;
  timelineId: string;
  left: number;
  width: number;
  effectHeight: number;
  onUpdate: (id: string, updates: Partial<MitEvent>) => void;
  onRemove: (id: string) => void;
  isEditing: boolean;
  onEditChange: (isEditing: boolean) => void;
  editPosition?: { x: number; y: number } | null;
  canUpdateStart?: (tStartMs: number) => boolean;
  isSelected?: boolean;
  onSelect?: (mit: MitEvent, e: React.MouseEvent) => void;
  onRightClick?: (e: React.MouseEvent, mit: MitEvent) => void;
}

export function DraggableMitigation({
  mit,
  timelineId,
  left,
  width,
  effectHeight,
  onUpdate,
  onRemove,
  isEditing,
  onEditChange,
  editPosition,
  canUpdateStart,
  isSelected,
  onSelect,
  onRightClick,
}: Props) {
  const { push } = useTopBanner();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: mit.id,
    // 为以后跨时间轴（移动/复制）准备；当前单时间轴行为不变。
    data: { type: 'existing-mit', mit, sourceTimelineId: timelineId },
  });

  const skill = getSkillDefinition(mit.skillId);

  const style = {
    left: left,
    width: width,
    position: 'absolute' as const,
    height: '100%',
    top: 0,
    pointerEvents: 'auto' as const,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group rounded-md transition-shadow ${
        isSelected ? 'ring-2 ring-[#2f81f7] z-30' : ''
      }`}
    >
      <div
        {...attributes}
        {...listeners}
        className={`w-full ${isDragging ? 'opacity-0' : ''}`}
        onClick={(e) => onSelect && onSelect(mit, e)}
        onContextMenu={(e) => {
          e.preventDefault();
          if (onRightClick) {
            onRightClick(e, mit);
          }
        }}
      >
        <MitigationBarContent
          headerClassName={`relative z-10 shadow-[0_6px_12px_var(--color-skill-shadow)] ${
            skill?.color || 'bg-slate-600'
          }`}
          iconSrc={skill ? getSkillIconLocalSrc(skill.actionId) : undefined}
          iconAlt={skill?.name ?? 'skill icon'}
          effectHeight={effectHeight}
        />
      </div>

      {/* 编辑态表单 */}
      {!isDragging && isEditing && (
        <MitigationEditPopover
          mit={mit}
          editPosition={editPosition}
          canUpdateStart={canUpdateStart}
          onUpdate={(updates) => onUpdate(mit.id, updates)}
          onRemove={() => onRemove(mit.id)}
          onClose={() => onEditChange(false)}
          onInvalidSubmit={() => push('冷却中，无法调整该技能时间。', { tone: 'error' })}
        />
      )}
    </div>
  );
}
