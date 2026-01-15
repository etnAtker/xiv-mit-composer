import { SKILLS } from '../data/skills';
import type { Job } from '../model/types';
import { DraggableSkill } from './Skill/DraggableSkill';

interface Props {
  selectedJob: Job;
}

export function SkillSidebar({ selectedJob }: Props) {
  return (
    <div className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col z-10 shadow-lg">
      <div className="p-4 border-b border-gray-800 bg-gray-900">
        <h3 className="font-bold text-gray-300 text-sm uppercase tracking-wide">可用技能 ({selectedJob})</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        {SKILLS.filter(s => s.job === selectedJob || s.job === 'ALL').map(skill => (
          <DraggableSkill key={skill.id} skill={skill} />
        ))}
      </div>
    </div>
  );
}
