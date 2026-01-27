import type { Job } from '../../model/types';
import type { TimelineSkillColumn } from './types';
import { XivIcon } from '../XivIcon';
import { JOB_ICON_LOCAL_SRC, getSkillIconLocalSrc } from '../../data/icons';
import { fetchActionIconUrl, fetchJobIconUrl } from '../../lib/xivapi/icons';
import { DAMAGE_LANE_WIDTH } from '../../constants/timeline';
import { MIT_COLUMN_WIDTH } from './timelineUtils';

const jobToneMap: Record<string, string> = {
  PLD: 'bg-blue-500/5',
  WAR: 'bg-red-500/5',
  DRK: 'bg-purple-500/5',
  GNB: 'bg-emerald-500/5',
};
const jobHeaderToneMap: Record<string, string> = {
  PLD: 'bg-blue-900/20 text-blue-300',
  WAR: 'bg-red-900/20 text-red-300',
  DRK: 'bg-purple-900/20 text-purple-300',
  GNB: 'bg-emerald-900/20 text-emerald-300',
};
const getJobTone = (job: Job) => jobToneMap[job] || 'bg-[#1f6feb]/5';
const getJobHeaderTone = (job: Job) => jobHeaderToneMap[job] || 'bg-[#1f6feb]/15 text-muted';

interface JobGroup {
  job: Job;
  skills: TimelineSkillColumn[];
}

interface Props {
  totalWidth: number;
  height: number;
  rulerWidth: number;
  castWidth: number;
  dmgWidth: number;
  isScrolled: boolean;
  jobGroups: JobGroup[];
  utilitySkills: TimelineSkillColumn[];
  hasSecondaryDamageLane: boolean;
  primaryJob?: Job;
  secondaryJob?: Job;
}

export function TimelineHeader({
  totalWidth,
  height,
  rulerWidth,
  castWidth,
  dmgWidth,
  isScrolled,
  jobGroups,
  utilitySkills,
  hasSecondaryDamageLane,
  primaryJob,
  secondaryJob,
}: Props) {
  return (
    <div
      className={`sticky top-0 z-60 flex border-b border-app bg-surface-3 ${
        isScrolled ? 'shadow-xl' : 'shadow-none'
      }`}
      style={{ width: totalWidth, height }}
    >
      <div className="sticky left-0 z-40 flex h-full bg-surface-3">
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
      </div>
      <div className="flex h-full flex-1">
        <div
          className="flex h-full flex-col border-r border-app bg-surface-2"
          style={{ width: dmgWidth }}
        >
          <div className="flex h-6 items-center justify-center border-b border-app text-[10px] font-bold uppercase text-muted">
            Damage
          </div>
          <div className="flex h-10 items-center justify-center">
            {primaryJob ? (
              <XivIcon
                localSrc={JOB_ICON_LOCAL_SRC[primaryJob]}
                remoteSrc={() => fetchJobIconUrl(primaryJob)}
                alt={`${primaryJob} icon`}
                className="h-5 w-5 object-contain"
                fallback={primaryJob}
              />
            ) : (
              <span className="text-[10px] font-mono text-muted">T1</span>
            )}
          </div>
        </div>
        {jobGroups.flatMap((group, index) => {
          const job = group.job;
          if (group.skills.length === 0) return [];
          const blocks = [
            <div
              key={`job-${job}`}
              className={`flex flex-col border-r border-app ${getJobTone(job)}`}
              style={{ width: group.skills.length * MIT_COLUMN_WIDTH }}
            >
              <div
                className={`flex h-6 py-3 items-center justify-center border-b border-app text-[14px] font-bold uppercase tracking-tight ${getJobHeaderTone(
                  job,
                )}`}
              >
                <div className="flex items-center gap-2">
                  <XivIcon
                    localSrc={JOB_ICON_LOCAL_SRC[job]}
                    remoteSrc={() => fetchJobIconUrl(job)}
                    alt={`${job} icon`}
                    className="h-5 w-5 object-contain"
                    fallback={job}
                  />
                  <span>{job}</span>
                </div>
              </div>
              <div className="flex">
                {group.skills.map((skill) => (
                  <div
                    key={`head-${skill.columnId}`}
                    className="flex h-10 w-10 items-center justify-center"
                    title={skill.name}
                  >
                    <XivIcon
                      localSrc={getSkillIconLocalSrc(skill.actionId)}
                      remoteSrc={
                        skill.actionId ? () => fetchActionIconUrl(skill.actionId) : undefined
                      }
                      alt={skill.name}
                      className="h-full w-full object-cover"
                      fallback={skill.icon ?? skill.name.slice(0, 1)}
                    />
                  </div>
                ))}
              </div>
            </div>,
          ];

          if (hasSecondaryDamageLane && index === 0) {
            blocks.push(
              <div
                key="secondary-damage-lane-header"
                className="flex flex-col border-r border-app bg-surface-2"
                style={{ width: DAMAGE_LANE_WIDTH }}
              >
                <div className="flex h-6 items-center justify-center border-b border-app text-[10px] font-bold uppercase text-muted">
                  Damage
                </div>
                <div className="flex h-10 items-center justify-center">
                  {secondaryJob ? (
                    <XivIcon
                      localSrc={JOB_ICON_LOCAL_SRC[secondaryJob]}
                      remoteSrc={() => fetchJobIconUrl(secondaryJob)}
                      alt={`${secondaryJob} icon`}
                      className="h-5 w-5 object-contain"
                      fallback={secondaryJob}
                    />
                  ) : (
                    <span className="text-[10px] font-mono text-muted">T2</span>
                  )}
                </div>
              </div>,
            );
          }

          return blocks;
        })}
        {utilitySkills.length > 0 && (
          <div
            className="flex flex-1 flex-col border-r border-app bg-surface-2"
            style={{ width: utilitySkills.length * MIT_COLUMN_WIDTH }}
          >
            <div className="flex h-6 items-center px-4 border-b border-app bg-surface-3">
              <span className="text-[12px] font-medium uppercase text-muted">Party Utility</span>
            </div>
            <div className="flex">
              {utilitySkills.map((skill) => (
                <div
                  key={`head-${skill.columnId}`}
                  className="flex h-10 w-10 items-center justify-center"
                  title={skill.name}
                >
                  <XivIcon
                    localSrc={getSkillIconLocalSrc(skill.actionId)}
                    remoteSrc={
                      skill.actionId ? () => fetchActionIconUrl(skill.actionId) : undefined
                    }
                    alt={skill.name}
                    className="h-full w-full object-cover"
                    fallback={skill.icon ?? skill.name.slice(0, 1)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
