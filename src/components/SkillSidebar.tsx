import { useMemo, useState } from 'react';
import { isSkillAvailableForJob, SKILLS } from '../data/skills';
import type { PartyMember } from '../model/types';
import { DraggableSkill } from './Skill/DraggableSkill';
import { XivIcon } from './XivIcon';
import { JOB_ICON_LOCAL_SRC } from '../data/icons';

interface Props {
  partyMembers: PartyMember[];
}

export function SkillSidebar({ partyMembers }: Props) {
  const [openMembers, setOpenMembers] = useState<Record<number, boolean>>({});

  const skillGroups = useMemo(
    () =>
      partyMembers.map((member) => ({
        member,
        skills: SKILLS.filter((skill) => isSkillAvailableForJob(skill, member.job)),
      })),
    [partyMembers],
  );

  return (
    <div className="w-64 bg-surface-2 border-r border-app flex flex-col z-10 shadow-lg">
      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        {skillGroups.map((group) => {
          const isOpen = openMembers[group.member.playerId] ?? false;
          return (
            <div key={group.member.playerId} className="rounded-lg border border-app bg-surface-3">
              <button
                type="button"
                onClick={() =>
                  setOpenMembers((prev) => ({
                    ...prev,
                    [group.member.playerId]: !(prev[group.member.playerId] ?? false),
                  }))
                }
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs uppercase tracking-wide text-muted"
              >
                <div className="flex min-w-0 items-end gap-2">
                  <XivIcon
                    localSrc={JOB_ICON_LOCAL_SRC[group.member.job]}
                    alt={`${group.member.job} icon`}
                    className="h-4 w-4 shrink-0 object-contain"
                  />
                  <span className="truncate leading-none">{group.member.name}</span>
                  <span className="font-mono text-[10px] leading-none">{group.member.job}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted">
                  <span>{group.skills.length}</span>
                  <svg
                    viewBox="0 0 16 16"
                    className={`h-3 w-3 shrink-0 text-muted transition-transform ${
                      isOpen ? '' : '-rotate-90'
                    }`}
                    aria-hidden="true"
                  >
                    <path
                      d="M4.5 6.5 8 10l3.5-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.8"
                    />
                  </svg>
                </div>
              </button>
              {isOpen && (
                <div className="px-3 pb-3 pt-1 space-y-2">
                  {group.skills.map((skill) => (
                    <DraggableSkill
                      key={`${group.member.playerId}-${skill.id}`}
                      skill={skill}
                      jobOverride={group.member.job}
                      ownerId={group.member.playerId}
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
