import type { MitEvent } from '../../model/types';
import { cn } from '../../utils';
import { EFFECT_BAR_COLOR } from './timelineUtils';

interface Props {
  mit: MitEvent;
  width: number; // 精确像素宽度
  height?: number | string;
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
  height,
  className,
  isSelected,
  onClick,
  onRightClick,
  isOverlay,
}: Props) {
  return (
    <div
      style={{ width, height: height ?? '100%', backgroundColor: EFFECT_BAR_COLOR }}
      className={cn(
        "relative flex items-center justify-center overflow-visible rounded-md border border-white/10 text-[10px] font-semibold text-white shadow-[0_6px_14px_rgba(0,0,0,0.35)] ring-1 ring-black/20 transition cursor-pointer after:pointer-events-none after:absolute after:inset-0 after:content-[''] after:bg-gradient-to-b after:from-white/20 after:via-white/10 after:to-transparent",
        className,
        isOverlay && 'opacity-90 ring-2 ring-[#6366f1]/70 z-50 shadow-2xl',
        isSelected && 'ring-2 ring-[#1f6feb]/80 z-50',
      )}
      onClick={(e) => onClick && onClick(mit, e)}
      onContextMenu={(e) => {
        e.preventDefault();
        if (onRightClick) {
          onRightClick(e, mit);
        }
      }}
    ></div>
  );
}
