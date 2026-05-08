import type { TimelineMemberGroup } from './timelineLayout';
import type { TimelineSkillColumn } from './types';
import { XivIcon } from '../XivIcon';
import { JOB_ICON_LOCAL_SRC, getSkillIconLocalSrc } from '../../data/icons';
import { MIT_COLUMN_WIDTH } from './timelineUtils';

interface Props {
  totalWidth: number;
  height: number;
  rulerWidth: number;
  castWidth: number;
  dmgWidth: number;
  isScrolled: boolean;
  memberGroups: TimelineMemberGroup[];
  utilitySkills: TimelineSkillColumn[];
  onToggleMemberCollapsed: (playerId: number, collapsed: boolean) => void;
}

export function TimelineHeader({
  totalWidth,
  height,
  rulerWidth,
  castWidth,
  dmgWidth,
  isScrolled,
  memberGroups,
  onToggleMemberCollapsed,
}: Props) {
  return (
    <div
      className={`sticky top-0 z-40 flex border-b border-app bg-surface-3 ${
        isScrolled ? 'shadow-xl' : 'shadow-none'
      }`}
      style={{ width: totalWidth, height }}
    >
      <div className="sticky left-0 z-30 flex h-full bg-surface-3">
        <div
          className="flex h-full items-center justify-center border-r border-app text-[10px] font-mono uppercase text-muted"
          style={{ width: rulerWidth }}
        >
          Time
        </div>
        <div
          className="flex h-full items-center justify-center border-r border-app bg-surface-2 text-[10px] font-bold uppercase text-muted"
          style={{ width: castWidth }}
        >
          Boss Cast
        </div>
        <div
          className="flex h-full flex-col border-r border-app bg-surface-2"
          style={{ width: dmgWidth }}
        >
          <div className="flex h-6 items-center justify-center border-b border-app text-[10px] font-bold uppercase text-muted">
            Damage
          </div>
          <div className="flex h-10 items-center justify-center text-[10px] font-mono text-muted">
            Party
          </div>
        </div>
      </div>

      <div className="flex h-full flex-1">
        {memberGroups.map((group) => {
          const { member } = group;
          return (
            <div
              key={`member-${member.playerId}`}
              className="flex flex-col border-r border-app bg-surface-2"
              style={{ width: group.width }}
            >
              <button
                type="button"
                className="flex h-6 min-w-0 items-center justify-center gap-1 overflow-hidden border-b border-app bg-surface-3 px-1 text-[11px] font-bold uppercase tracking-tight text-muted"
                title={`${member.name} (${member.job})`}
                onClick={() => onToggleMemberCollapsed(member.playerId, !member.collapsed)}
              >
                <XivIcon
                  localSrc={JOB_ICON_LOCAL_SRC[member.job]}
                  alt={`${member.job} icon`}
                  className="h-4 w-4 shrink-0 translate-y-px object-contain"
                />
                {!member.collapsed && (
                  <span className="relative top-[2px] block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap leading-none text-app">
                    {member.name}
                  </span>
                )}
                <svg
                  viewBox="0 0 16 16"
                  className={`h-3 w-3 shrink-0 text-muted transition-transform ${
                    member.collapsed ? '-rotate-90' : ''
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
              </button>

              {member.collapsed ? (
                <div className="flex h-10 items-center justify-center text-[10px] font-mono leading-none text-muted">
                  {member.job}
                </div>
              ) : (
                <div className="flex justify-center" style={{ width: group.width }}>
                  {group.skills.map((skill) => (
                    <div
                      key={`head-${skill.columnId}`}
                      className="flex h-10 items-center justify-center"
                      style={{ width: MIT_COLUMN_WIDTH }}
                      title={skill.name}
                    >
                      {skill.actionId ? (
                        <XivIcon
                          localSrc={getSkillIconLocalSrc(skill.actionId)}
                          alt={skill.name}
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
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
