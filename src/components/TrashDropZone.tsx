import { useDroppable } from '@dnd-kit/core';
import { cn } from '../utils';
import { buildDropZoneId, type DropZoneData } from '../dnd/types';

interface Props {
  isActive: boolean;
}

export function TrashDropZone({ isActive }: Props) {
  // 只在拖拽已有减伤时显示，避免正常模式下抢点击/hover (hover)。
  const zone: DropZoneData = { kind: 'trash' };
  const { setNodeRef, isOver } = useDroppable({
    id: buildDropZoneId(zone),
    data: zone,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full border border-app bg-surface-3 shadow-2xl backdrop-blur-xl transition-all',
        isActive ? 'opacity-100 scale-100' : 'opacity-0 scale-90 pointer-events-none',
        isOver && 'border-(--color-danger) bg-(--color-danger)/15',
      )}
      aria-hidden={!isActive}
    >
      <span
        className={cn('text-[18px] select-none', isOver ? 'text-danger' : 'text-muted')}
        aria-hidden="true"
      >
        🗑️
      </span>
    </div>
  );
}
