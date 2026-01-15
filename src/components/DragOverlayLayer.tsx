import { DragOverlay } from '@dnd-kit/core';
import type { MitEvent, Skill } from '../model/types';
import { MitigationBar } from './Timeline/MitigationBar';
import { SkillCard } from './Skill/SkillCard';
import { MS_PER_SEC } from '../constants/time';

export type DragOverlayItem =
  | { type: 'new-skill'; skill: Skill }
  | { type: 'existing-mit'; mit: MitEvent };

interface Props {
  activeItem: DragOverlayItem | null;
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
          width={(activeItem.mit.durationMs / MS_PER_SEC) * zoom}
          isOverlay
        />
      )}
    </DragOverlay>
  );
}
