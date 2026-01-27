import type { MitEvent } from '../../model/types';
import { cn } from '../../utils';
import { EFFECT_BAR_COLOR } from './timelineUtils';
import { getSkillDefinition } from '../../data/skills';
import { getSkillIconLocalSrc } from '../../data/icons';
import { XivIcon } from '../XivIcon';
import { MS_PER_SEC } from '../../constants/time';

interface Props {
  mit: MitEvent;
  width: number; // 精确像素宽度
  zoom: number;
  className?: string;
  isSelected?: boolean;
  onClick?: (mit: MitEvent, e: React.MouseEvent) => void;
  onRightClick?: (e: React.MouseEvent, mit: MitEvent) => void;
  // 仅用于展示，无需拖拽处理
  isOverlay?: boolean;
}

export function MitigationBar({
  mit,
  width,
  zoom,
  className,
  isSelected,
  onClick,
  onRightClick,
  isOverlay,
}: Props) {
  const skill = getSkillDefinition(mit.skillId);
  const iconFallback = skill?.icon ?? skill?.name?.slice(0, 1) ?? '';
  const effectHeight = (mit.durationMs / MS_PER_SEC) * zoom;
  const cooldownMs = (skill?.cooldownSec ?? 0) * MS_PER_SEC;
  const cooldownHeight = (cooldownMs / MS_PER_SEC) * zoom;
  const totalHeight = 40 + effectHeight + cooldownHeight;

  return (
    <div
      style={{ width, height: totalHeight }}
      className={cn(
        'relative flex items-center justify-center overflow-visible rounded-md border border-white/10 text-[10px] font-semibold text-white shadow-[0_6px_14px_rgba(0,0,0,0.35)] ring-1 ring-black/20 transition cursor-pointer',
        className,
        isOverlay && 'opacity-90 ring-2 ring-[#6366f1]/70 z-30 shadow-2xl',
        isSelected && 'ring-2 ring-[#1f6feb]/80 z-30',
      )}
      onClick={(e) => onClick && onClick(mit, e)}
      onContextMenu={(e) => {
        e.preventDefault();
        if (onRightClick) {
          onRightClick(e, mit);
        }
      }}
    >
      <div className="flex w-full flex-col">
        <div
          className={`relative z-10 flex h-10 w-full items-center justify-center text-white shadow-[0_6px_12px_var(--color-skill-shadow)] ${
            skill?.color || 'bg-slate-600'
          }`}
        >
          <XivIcon
            localSrc={getSkillIconLocalSrc(skill?.actionId)}
            alt={skill?.name ?? 'skill icon'}
            className="h-full w-full object-cover"
            fallback={iconFallback}
          />
        </div>
        <div
          className="relative z-0 w-full border-x border-white/10 shadow-inner"
          style={{ height: effectHeight, backgroundColor: EFFECT_BAR_COLOR }}
        />
        {cooldownHeight > 0 && (
          <div
            className="relative z-0 w-full border-x border-app bg-surface shadow-[inset_0_0_10px_var(--color-cooldown-shadow)]"
            style={{
              height: cooldownHeight,
              backgroundImage:
                'repeating-linear-gradient(45deg, var(--color-cooldown-hatch), var(--color-cooldown-hatch) 4px, transparent 4px, transparent 8px)',
            }}
          >
            <div className="sticky top-14 text-center">
              <span className="text-[8px] font-mono uppercase text-muted">CD</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
