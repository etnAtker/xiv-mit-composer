import { DragOverlay } from '@dnd-kit/core';
import { MitigationBar } from './Timeline/MitigationBar';
import { SkillCard } from './Skill/SkillCard';
import { MIT_COLUMN_PADDING, MIT_COLUMN_WIDTH } from './Timeline/timelineUtils';
import type { DragItemData } from '../dnd/types';

interface Props {
  activeItem: DragItemData | null;
  zoom: number;
}

export function DragOverlayLayer({ activeItem, zoom }: Props) {
  return (
    <DragOverlay>
      {activeItem?.type === 'new-skill' && (
        <SkillCard skill={activeItem.skill} className="opacity-90 shadow-2xl scale-105" />
      )}
      {activeItem?.type === 'existing-mit' && (
        <MitigationBar
          mit={activeItem.mit}
          width={MIT_COLUMN_WIDTH - MIT_COLUMN_PADDING * 2}
          zoom={zoom}
          isOverlay
        />
      )}
    </DragOverlay>
  );
}
