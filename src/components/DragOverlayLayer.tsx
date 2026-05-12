import { DragOverlay } from '@dnd-kit/core';
import { MitigationBar } from './Timeline/MitigationBar';
import { SkillCard } from './Skill/SkillCard';
import { MIT_COLUMN_PADDING, MIT_COLUMN_WIDTH } from './Timeline/timelineUtils';
import type { DragItemData } from '../dnd/types';
import { getSkillDefinition } from '../data/skills';
import { getSkillIconLocalSrc } from '../data/icons';
import { XivIcon } from './XivIcon';

interface Props {
  activeItem: DragItemData | null;
  zoom: number;
  isInvalid?: boolean;
}

export function DragOverlayLayer({ activeItem, zoom, isInvalid }: Props) {
  const durationEnderSkill =
    activeItem?.type === 'duration-ender' ? getSkillDefinition(activeItem.skillId) : undefined;

  return (
    <DragOverlay>
      {activeItem?.type === 'new-skill' && (
        <SkillCard
          skill={activeItem.skill}
          job={activeItem.ownerJob}
          className={`opacity-90 shadow-2xl scale-105 ${
            isInvalid ? 'border-red-500 bg-red-500/20' : ''
          }`}
        />
      )}
      {activeItem?.type === 'existing-mit' && (
        <MitigationBar
          mit={activeItem.mit}
          width={MIT_COLUMN_WIDTH - MIT_COLUMN_PADDING * 2}
          zoom={zoom}
          isOverlay
          isInvalid={isInvalid}
        />
      )}
      {activeItem?.type === 'duration-ender' && durationEnderSkill && (
        <div
          className={`h-8 w-8 overflow-hidden rounded border border-white/70 bg-black/50 shadow-2xl ${
            isInvalid ? 'ring-2 ring-red-500/80' : ''
          }`}
        >
          <XivIcon
            localSrc={getSkillIconLocalSrc(durationEnderSkill.actionId)}
            alt={durationEnderSkill.name}
            className="h-full w-full object-cover"
          />
        </div>
      )}
    </DragOverlay>
  );
}
