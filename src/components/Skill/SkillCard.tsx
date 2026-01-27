import type { Job, Skill } from '../../model/types';
import { cn } from '../../utils';
import { XivIcon } from '../XivIcon';
import { JOB_ICON_LOCAL_SRC, getSkillIconLocalSrc } from '../../data/icons';
import { COOLDOWN_GROUP_MAP } from '../../data/skills';

interface Props {
  skill: Skill;
  className?: string;
  job?: Job;
}

export function SkillCard({ skill, className, job }: Props) {
  const displayJob = job ?? (skill.job !== 'ALL' ? skill.job : undefined);
  const cooldownGroup = skill.cooldownGroup ? COOLDOWN_GROUP_MAP.get(skill.cooldownGroup) : null;
  const isStackedCooldown = cooldownGroup ? cooldownGroup.stack > 1 : false;
  const cooldownText = isStackedCooldown
    ? `充能: ${cooldownGroup?.cooldownSec ?? skill.cooldownSec}s`
    : `CD: ${skill.cooldownSec}s`;
  const stackHint = isStackedCooldown ? `上限：${cooldownGroup?.stack ?? 1}` : '';

  return (
    <div
      className={cn(
        'relative flex items-center gap-2 rounded-md border border-[#1f6feb]/40 bg-[#1f6feb]/15 p-2 text-sm font-medium text-app shadow transition-colors cursor-grab hover:bg-[#1f6feb]/25',
        className,
      )}
    >
      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-[#0b1f3a]/40">
        <XivIcon
          localSrc={getSkillIconLocalSrc(skill.actionId)}
          alt={skill.name}
          className="h-full w-full object-cover"
          fallback={skill.name.slice(0, 1)}
        />
      </div>

      <div className="min-w-0 flex-1 pointer-events-none">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate">{skill.name}</span>
          <span className="text-[10px] font-mono text-muted">{skill.durationSec}s</span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-[10px] font-mono text-muted">
          <span>{cooldownText}</span>
          {stackHint ? <span>· {stackHint}</span> : null}
        </div>
      </div>

      {displayJob && (
        <div className="absolute bottom-1 right-1 h-4 w-4 overflow-hidden rounded-sm bg-[#0b1f3a]/50">
          <XivIcon
            localSrc={JOB_ICON_LOCAL_SRC[displayJob]}
            alt={`${displayJob} icon`}
            className="h-full w-full object-cover"
            fallback={displayJob}
          />
        </div>
      )}
    </div>
  );
}
