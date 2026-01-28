import { useDraggable } from '@dnd-kit/core';
import type { MitEvent } from '../../model/types';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MS_PER_SEC, TIME_DECIMAL_PLACES } from '../../constants/time';
import { getSkillDefinition } from '../../data/skills';
import { getSkillIconLocalSrc } from '../../data/icons';
import { MitigationBarContent } from './MitigationBar';
import { useTopBanner } from '../../hooks/useTopBanner';

interface Props {
  mit: MitEvent;
  timelineId: string;
  left: number;
  width: number;
  effectHeight: number;
  cooldownHeight: number;
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
  cooldownHeight,
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
  const [isEditInvalid, setIsEditInvalid] = useState(false);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: mit.id,
    // 为以后跨时间轴（移动/复制）准备；当前单时间轴行为不变。
    data: { type: 'existing-mit', mit, sourceTimelineId: timelineId },
  });

  const skill = getSkillDefinition(mit.skillId);
  const iconFallback = skill?.icon ?? skill?.name?.slice(0, 1) ?? '';

  const style = {
    left: left,
    width: width,
    position: 'absolute' as const,
    height: '100%',
    top: 0,
    pointerEvents: 'auto' as const,
  };

  const editInputRef = useRef<HTMLInputElement>(null);

  const handleEditSubmit = () => {
    const rawValue = editInputRef.current?.value ?? '';
    const val = parseFloat(rawValue);
    if (!isNaN(val)) {
      const nextStartMs = val * MS_PER_SEC;
      if (Math.abs(nextStartMs - mit.tStartMs) < 0.5) {
        onEditChange(false);
        return;
      }
      if (canUpdateStart && !canUpdateStart(nextStartMs)) {
        push('冷却中，无法调整该技能时间。', { tone: 'error' });
        return;
      }
      onEditChange(false);
      onUpdate(mit.id, {
        tStartMs: nextStartMs,
        tEndMs: nextStartMs + mit.durationMs,
      });
    }
  };

  const handleEditBlur = () => {
    if (!canUpdateStart) return;
    const rawValue = editInputRef.current?.value ?? '';
    const val = parseFloat(rawValue);
    if (isNaN(val)) return;
    const nextStartMs = val * MS_PER_SEC;
    setIsEditInvalid(!canUpdateStart(nextStartMs));
  };

  const editForm = (
    <div
      className={`${
        editPosition ? 'fixed z-50' : 'absolute left-0 top-full z-30 mt-2'
      } min-w-40 rounded-lg border border-app bg-surface-3 p-3 shadow-2xl backdrop-blur-xl flex flex-col gap-2 text-app`}
      style={editPosition ? { left: editPosition.x, top: editPosition.y } : undefined}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted font-mono">
        编辑事件
      </label>

      <div className="flex items-center gap-2">
        <label className="whitespace-nowrap text-[10px] text-muted font-mono">开始(s):</label>
        <div className="relative">
          <input
            autoFocus
            className={`w-16 rounded-md border bg-surface px-2 py-1 text-[11px] font-mono text-app focus:outline-none focus:ring-2 ${
              isEditInvalid
                ? 'border-red-500 focus:ring-red-500/40'
                : 'border-app focus:ring-(--color-focus)'
            }`}
            ref={editInputRef}
            defaultValue={(mit.tStartMs / MS_PER_SEC).toFixed(TIME_DECIMAL_PLACES)}
            aria-label="开始时间（秒）"
            onKeyDown={(e) => e.key === 'Enter' && handleEditSubmit()}
            onBlur={handleEditBlur}
            onFocus={() => setIsEditInvalid(false)}
          />
          {isEditInvalid && (
            <span
              className="absolute -right-5 top-1/2 -translate-y-1/2 text-red-500 text-[20px] font-bold cursor-help"
              title="CD 冲突，无法应用"
            >
              ×
            </span>
          )}
        </div>
      </div>

      <div className="mt-1 flex items-center justify-between border-t border-app pt-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(mit.id);
          }}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-danger transition-colors hover:bg-(--color-danger)/10 hover:text-white active:scale-[0.98]"
        >
          <span aria-hidden="true">🗑️</span> 删除
        </button>

        <button
          type="button"
          onClick={handleEditSubmit}
          className="rounded-md bg-primary-action px-3 py-1 text-[11px] text-white transition-colors hover:bg-[#2ea043] active:scale-[0.98]"
        >
          确定
        </button>
      </div>
    </div>
  );

  return (
    <div ref={setNodeRef} style={style} className="group">
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
          } ${isSelected ? 'ring-2 ring-[#2f81f7]' : ''}`}
          iconSrc={getSkillIconLocalSrc(skill?.actionId)}
          iconAlt={skill?.name ?? 'skill icon'}
          iconFallback={iconFallback}
          effectHeight={effectHeight}
          cooldownHeight={cooldownHeight}
        />
      </div>

      {/* 编辑态表单 */}
      {!isDragging &&
        isEditing &&
        (editPosition && typeof document !== 'undefined'
          ? createPortal(editForm, document.body)
          : editForm)}
    </div>
  );
}
