import type { Job, Skill } from '../../model/types';
import { DAMAGE_LANE_WIDTH } from '../../constants/timeline';
import { isRoleSkillAvailableForJob } from '../../data/skills';
import { MIT_COLUMN_WIDTH } from './timelineUtils';
import type { TimelineSkillColumn } from './types';

export interface TimelineLayout {
  columnMap: Record<string, number>;
  skillColumns: TimelineSkillColumn[];
  headerSkillColumns: TimelineSkillColumn[];
  jobOrder: Job[];
  jobGroups: { job: Job; skills: TimelineSkillColumn[] }[];
  utilitySkills: TimelineSkillColumn[];
  hasSecondaryDamageLane: boolean;
  firstGroupCount: number;
  columnLefts: number[];
  mitAreaWidth: number;
  primaryJob?: Job;
  secondaryJob?: Job;
  secondaryDamageLaneOffset: number;
  lastColumnIndexByJob: Partial<Record<Job, number>>;
  defaultOwnerJob?: Job;
}

const PLACEHOLDER_COLUMN: TimelineSkillColumn = {
  id: 'mit-placeholder',
  columnId: 'mit-placeholder',
  name: '减伤',
  color: 'bg-surface-4',
  job: 'ALL',
};

export function buildTimelineLayout({
  jobs,
  skills,
  roleSkillIds,
}: {
  jobs: Job[];
  skills: Skill[];
  roleSkillIds: Set<string>;
}): TimelineLayout {
  if (!jobs.length) {
    return {
      columnMap: {},
      skillColumns: [],
      headerSkillColumns: [PLACEHOLDER_COLUMN],
      jobOrder: [],
      jobGroups: [],
      utilitySkills: [PLACEHOLDER_COLUMN],
      hasSecondaryDamageLane: false,
      firstGroupCount: 0,
      columnLefts: [],
      mitAreaWidth: MIT_COLUMN_WIDTH,
      primaryJob: undefined,
      secondaryJob: undefined,
      secondaryDamageLaneOffset: 0,
      lastColumnIndexByJob: {},
      defaultOwnerJob: undefined,
    };
  }

  const jobColumns = jobs.flatMap((job) =>
    skills
      .filter(
        (s) => s.job === job || (roleSkillIds.has(s.id) && isRoleSkillAvailableForJob(s.id, job)),
      )
      .map((skill) => ({
        id: skill.id,
        columnId: skill.job === 'ALL' ? `${skill.id}:${job}` : skill.id,
        name: skill.name,
        color: skill.color,
        icon: skill.icon,
        actionId: skill.actionId,
        job,
      })),
  );

  const utilityColumns = skills
    .filter((s) => s.job === 'ALL' && !roleSkillIds.has(s.id))
    .map((skill) => ({
      id: skill.id,
      columnId: skill.id,
      name: skill.name,
      color: skill.color,
      icon: skill.icon,
      actionId: skill.actionId,
      job: 'ALL',
    }));

  const skillColumns = [...jobColumns, ...utilityColumns];
  const columnMap: Record<string, number> = {};
  skillColumns.forEach((skill, index) => {
    columnMap[skill.columnId] = index;
  });

  const hasSecondaryDamageLane = jobs.length > 1;
  const baseMitWidth = Math.max(MIT_COLUMN_WIDTH, skillColumns.length * MIT_COLUMN_WIDTH);
  const mitAreaWidth = baseMitWidth + (hasSecondaryDamageLane ? DAMAGE_LANE_WIDTH : 0);

  const headerSkillColumns = skillColumns.length > 0 ? skillColumns : [PLACEHOLDER_COLUMN];
  const jobOrder = jobs;
  const jobGroups = jobOrder.map((job) => ({
    job,
    skills: headerSkillColumns.filter((skill) => skill.job === job),
  }));
  const utilitySkills = headerSkillColumns.filter((skill) => skill.job === 'ALL');

  const firstGroupCount = jobGroups[0]?.skills.length ?? 0;
  const columnLefts = skillColumns.map((_, index) => {
    const baseLeft = index * MIT_COLUMN_WIDTH;
    if (!hasSecondaryDamageLane || firstGroupCount === 0) return baseLeft;
    return index >= firstGroupCount ? baseLeft + DAMAGE_LANE_WIDTH : baseLeft;
  });

  const lastColumnIndexByJob: Partial<Record<Job, number>> = {};
  headerSkillColumns.forEach((skill, idx) => {
    if (skill.job !== 'ALL') {
      lastColumnIndexByJob[skill.job as Job] = idx;
    }
  });

  return {
    columnMap,
    skillColumns,
    headerSkillColumns,
    jobOrder,
    jobGroups,
    utilitySkills,
    hasSecondaryDamageLane,
    firstGroupCount,
    columnLefts,
    mitAreaWidth,
    primaryJob: jobOrder[0],
    secondaryJob: jobOrder[1],
    secondaryDamageLaneOffset: firstGroupCount * MIT_COLUMN_WIDTH,
    lastColumnIndexByJob,
    defaultOwnerJob: jobOrder[0],
  };
}
