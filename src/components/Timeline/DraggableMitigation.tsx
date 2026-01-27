import { useDraggable } from '@dnd-kit/core';
import type { MitEvent } from '../../model/types';
import { useRef } from 'react';
import { MS_PER_SEC, TIME_DECIMAL_PLACES } from '../../constants/time';
import { SKILLS } from '../../data/skills';
import { XivIcon } from '../XivIcon';
import { getSkillIconLocalSrc } from '../../data/icons';
import { fetchActionIconUrl } from '../../lib/xivapi/icons';
import { EFFECT_BAR_COLOR } from './timelineUtils';

interface Props {
  mit: MitEvent;
  left: number;
  width: number;
  effectHeight: number;
  cooldownHeight: number;
  onUpdate: (id: string, updates: Partial<MitEvent>) => void;
  onRemove: (id: string) => void;
  isEditing: boolean;
  onEditChange: (isEditing: boolean) => void;
  isSelected?: boolean;
  onSelect?: (mit: MitEvent, e: React.MouseEvent) => void;
  onRightClick?: (e: React.MouseEvent, mit: MitEvent) => void;
}

export function DraggableMitigation({
  mit,
  left,
  width,
  effectHeight,
  cooldownHeight,
  onUpdate,
  onRemove,
  isEditing,
  onEditChange,
  isSelected,
  onSelect,
  onRightClick,
}: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: mit.id,
    data: { type: 'existing-mit', mit },
  });

  const skill = SKILLS.find((s) => s.id === mit.skillId);
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
    onEditChange(false);
    const rawValue = editInputRef.current?.value ?? '';
    const val = parseFloat(rawValue);
    if (!isNaN(val)) {
      onUpdate(mit.id, {
        tStartMs: val * MS_PER_SEC,
        tEndMs: val * MS_PER_SEC + mit.durationMs,
      });
    }
  };

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
        <div className="flex w-full flex-col">
          <div
            className={`flex h-10 w-full items-center justify-center text-white shadow-lg ${
              skill?.color || 'bg-slate-600'
            } ${isSelected ? 'ring-2 ring-[#2f81f7]' : ''}`}
          >
            <XivIcon
              localSrc={getSkillIconLocalSrc(skill?.actionId)}
              remoteSrc={skill?.actionId ? () => fetchActionIconUrl(skill.actionId) : undefined}
              alt={skill?.name ?? 'skill icon'}
              className="h-full w-full object-cover"
              fallback={iconFallback}
            />
          </div>
          <div
            className="w-full border-x border-white/10 shadow-inner"
            style={{ height: effectHeight, backgroundColor: EFFECT_BAR_COLOR }}
          />
          {cooldownHeight > 0 && (
            <div
              className="w-full border-x border-app bg-surface shadow-[inset_0_0_12px_rgba(48,54,61,0.25)]"
              style={{
                height: cooldownHeight,
                backgroundImage:
                  'repeating-linear-gradient(45deg, rgba(48, 54, 61, 0.4), rgba(48, 54, 61, 0.4) 4px, transparent 4px, transparent 8px)',
              }}
            >
              <div className="sticky top-14 text-center">
                <span className="text-[8px] font-mono uppercase text-muted">CD</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 编辑态表单 */}
      {!isDragging && isEditing && (
        <div
          className="absolute left-0 top-full z-[100] mt-2 min-w-[160px] rounded-lg border border-app bg-surface-3 p-3 shadow-2xl backdrop-blur-xl flex flex-col gap-2 text-app"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted font-mono">
            编辑事件
          </label>

          <div className="flex items-center gap-2">
            <label className="whitespace-nowrap text-[10px] text-muted font-mono">开始(s):</label>
            <input
              autoFocus
              className="w-16 rounded-md border border-app bg-surface px-2 py-1 text-[11px] font-mono text-app focus:outline-none focus:ring-2 focus:ring-[var(--color-focus)]"
              ref={editInputRef}
              defaultValue={(mit.tStartMs / MS_PER_SEC).toFixed(TIME_DECIMAL_PLACES)}
              aria-label="开始时间（秒）"
              onKeyDown={(e) => e.key === 'Enter' && handleEditSubmit()}
            />
          </div>

          <div className="mt-1 flex items-center justify-between border-t border-app pt-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(mit.id);
              }}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-danger transition-colors hover:bg-[var(--color-danger)]/10 hover:text-white active:scale-[0.98]"
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
      )}
    </div>
  );
}
