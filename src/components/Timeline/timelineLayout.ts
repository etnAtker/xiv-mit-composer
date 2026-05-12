import type { Job, PartyMember, Skill } from '../../model/types';
import { COOLDOWN_GROUP_MAP, isSkillAvailableForJob } from '../../data/skills';
import {
  MIN_MEMBER_GROUP_WIDTH,
  MIT_COLUMN_WIDTH,
  MIT_MEMBER_GROUP_PADDING_X,
  RESOURCE_COLUMN_WIDTH,
} from './timelineUtils';
import type { TimelineResourceColumn, TimelineSkillColumn } from './types';

export const COLLAPSED_MEMBER_WIDTH = 56;

export interface TimelineMemberGroup {
  member: PartyMember;
  resourceColumns: TimelineResourceColumn[];
  skills: TimelineSkillColumn[];
  collapsed: boolean;
  width: number;
  left: number;
}

export interface TimelineLayout {
  columnMap: Record<string, number>;
  skillColumns: TimelineSkillColumn[];
  resourceColumns: TimelineResourceColumn[];
  headerSkillColumns: TimelineSkillColumn[];
  memberGroups: TimelineMemberGroup[];
  jobOrder: Job[];
  columnLefts: number[];
  resourceColumnLefts: Record<string, number>;
  mitAreaWidth: number;
  defaultOwnerJob?: Job;
  defaultOwnerId?: number;
}

const PLACEHOLDER_COLUMN: TimelineSkillColumn = {
  id: 'mit-placeholder',
  columnId: 'mit-placeholder',
  name: '减伤',
  job: 'ALL',
};

export function buildTimelineLayout({
  members,
  skills,
}: {
  members: PartyMember[];
  skills: Skill[];
}): TimelineLayout {
  if (!members.length) {
    return {
      columnMap: {},
      skillColumns: [],
      resourceColumns: [],
      headerSkillColumns: [PLACEHOLDER_COLUMN],
      memberGroups: [],
      jobOrder: [],
      columnLefts: [],
      resourceColumnLefts: {},
      mitAreaWidth: MIT_COLUMN_WIDTH,
      defaultOwnerJob: undefined,
      defaultOwnerId: undefined,
    };
  }

  const skillColumns: TimelineSkillColumn[] = [];
  const resourceColumns: TimelineResourceColumn[] = [];
  const memberGroups: TimelineMemberGroup[] = [];
  const columnLefts: number[] = [];
  const resourceColumnLefts: Record<string, number> = {};
  let cursor = 0;

  for (const member of members) {
    if (member.collapsed) {
      const group: TimelineMemberGroup = {
        member,
        resourceColumns: [],
        skills: [],
        collapsed: true,
        width: COLLAPSED_MEMBER_WIDTH,
        left: cursor,
      };
      memberGroups.push(group);
      cursor += COLLAPSED_MEMBER_WIDTH;
      continue;
    }

    const availableSkills = skills.filter((skill) => isSkillAvailableForJob(skill, member.job));
    const memberSkills = availableSkills.map(
      (skill): TimelineSkillColumn => ({
        id: skill.id,
        columnId: `${skill.id}:${member.playerId}`,
        name: skill.name,
        icon: skill.icon,
        actionId: skill.actionId,
        job: member.job,
        ownerId: member.playerId,
        ownerName: member.name,
      }),
    );

    const memberResourceColumns = buildMemberResourceColumns(member, availableSkills);

    const resourceWidth = memberResourceColumns.length * RESOURCE_COLUMN_WIDTH;
    const skillWidth = memberSkills.length * MIT_COLUMN_WIDTH;
    const contentWidth = resourceWidth + skillWidth;
    const groupWidth = Math.max(
      MIN_MEMBER_GROUP_WIDTH,
      contentWidth + MIT_MEMBER_GROUP_PADDING_X * 2,
    );
    const groupLeft = cursor;
    const groupContentLeft = groupLeft + (groupWidth - contentWidth) / 2;
    memberResourceColumns.forEach((resource, index) => {
      const left = groupContentLeft + index * RESOURCE_COLUMN_WIDTH;
      resourceColumnLefts[resource.columnId] = left;
      resourceColumns.push(resource);
    });
    memberSkills.forEach((skill, index) => {
      columnLefts.push(groupContentLeft + resourceWidth + index * MIT_COLUMN_WIDTH);
      skillColumns.push(skill);
    });
    cursor += groupWidth;
    memberGroups.push({
      member,
      resourceColumns: memberResourceColumns,
      skills: memberSkills,
      collapsed: false,
      width: groupWidth,
      left: groupLeft,
    });
  }

  const columnMap: Record<string, number> = {};
  skillColumns.forEach((skill, index) => {
    columnMap[skill.columnId] = index;
  });

  const mitAreaWidth = Math.max(MIT_COLUMN_WIDTH, cursor);

  const headerSkillColumns = skillColumns.length > 0 ? skillColumns : [PLACEHOLDER_COLUMN];
  const jobOrder = members.map((member) => member.job);

  return {
    columnMap,
    skillColumns,
    resourceColumns,
    headerSkillColumns,
    memberGroups,
    jobOrder,
    columnLefts,
    resourceColumnLefts,
    mitAreaWidth,
    defaultOwnerJob: jobOrder[0],
    defaultOwnerId: members[0]?.playerId,
  };
}

function buildMemberResourceColumns(
  member: PartyMember,
  memberSkills: Skill[],
): TimelineResourceColumn[] {
  const groups = new Map<string, TimelineResourceColumn>();

  for (const skill of memberSkills) {
    const cooldownGroupIds = Array.isArray(skill.cooldownGroup)
      ? skill.cooldownGroup
      : skill.cooldownGroup
        ? [skill.cooldownGroup]
        : [];

    for (const cooldownGroupId of cooldownGroupIds) {
      if (groups.has(cooldownGroupId)) continue;

      const group = COOLDOWN_GROUP_MAP.get(cooldownGroupId);
      if (!group?.resourceDisplay) continue;

      groups.set(cooldownGroupId, {
        id: cooldownGroupId,
        columnId: `${cooldownGroupId}:${member.playerId}`,
        label: group.resourceDisplay.label,
        ownerId: member.playerId,
        ownerName: member.name,
        job: member.job,
        initialValue: Math.min(Math.max(group.initialStack ?? group.stack, 0), group.stack),
        maxValue: group.stack,
      });
    }
  }

  return [...groups.values()];
}
