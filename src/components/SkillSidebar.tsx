import { useMemo, useState } from 'react';
import { isSkillAvailableForJob, SKILLS } from '../data/skills';
import type { Job } from '../model/types';
import { DraggableSkill } from './Skill/DraggableSkill';
import { XivIcon } from './XivIcon';
import { JOB_ICON_LOCAL_SRC } from '../data/icons';

interface Props {
  selectedJob: Job;
  selectedJobs?: Job[];
}

export function SkillSidebar({ selectedJob, selectedJobs }: Props) {
  const jobs = useMemo(
    () =>
      selectedJobs && selectedJobs.length > 0 ? Array.from(new Set(selectedJobs)) : [selectedJob],
    [selectedJob, selectedJobs],
  );
  const [openJobs, setOpenJobs] = useState<Record<Job, boolean>>({
    PLD: false,
    WAR: false,
    DRK: false,
    GNB: false,
    WHM: false,
    SCH: false,
    AST: false,
    SGE: false,
    MNK: false,
    DRG: false,
    NIN: false,
    SAM: false,
    RPR: false,
    VPR: false,
    BRD: false,
    MCH: false,
    DNC: false,
    BLM: false,
    SMN: false,
    RDM: false,
    PCT: false,
  });

  const skillGroups = useMemo(
    () =>
      jobs.map((job) => ({
        job,
        skills: SKILLS.filter((skill) => isSkillAvailableForJob(skill, job)),
      })),
    [jobs],
  );

  return (
    <div className="w-64 bg-surface-2 border-r border-app flex flex-col z-10 shadow-lg">
      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        {skillGroups.map((group) => {
          const isOpen = openJobs[group.job];
          return (
            <div key={group.job} className="rounded-lg border border-app bg-surface-3">
              <button
                type="button"
                onClick={() => setOpenJobs((prev) => ({ ...prev, [group.job]: !prev[group.job] }))}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs uppercase tracking-wide text-muted"
              >
                <div className="flex items-center gap-2">
                  <span>{group.job} 技能</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted">
                  <span>{group.skills.length}</span>
                  <XivIcon
                    localSrc={JOB_ICON_LOCAL_SRC[group.job]}
                    alt={`${group.job} icon`}
                    className="h-4 w-4 object-contain"
                  />
                  <span className={isOpen ? 'rotate-90' : ''}>{'>'}</span>
                </div>
              </button>
              {isOpen && (
                <div className="px-3 pb-3 pt-1 space-y-2">
                  {group.skills.map((skill) => (
                    <DraggableSkill
                      key={`${group.job}-${skill.id}`}
                      skill={skill}
                      jobOverride={group.job}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
