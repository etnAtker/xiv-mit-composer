import type { Job, PartyMember, Skill } from '../../model/types';
import { isSkillAvailableForJob } from '../../data/skills';
import {
  MIN_MEMBER_GROUP_WIDTH,
  MIT_COLUMN_WIDTH,
  MIT_MEMBER_GROUP_PADDING_X,
} from './timelineUtils';
import type { TimelineSkillColumn } from './types';

export const COLLAPSED_MEMBER_WIDTH = 56;

export interface TimelineMemberGroup {
  member: PartyMember;
  skills: TimelineSkillColumn[];
  collapsed: boolean;
  width: number;
  left: number;
}

export interface TimelineLayout {
  columnMap: Record<string, number>;
  skillColumns: TimelineSkillColumn[];
  headerSkillColumns: TimelineSkillColumn[];
  memberGroups: TimelineMemberGroup[];
  jobOrder: Job[];
  columnLefts: number[];
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
      headerSkillColumns: [PLACEHOLDER_COLUMN],
      memberGroups: [],
      jobOrder: [],
      columnLefts: [],
      mitAreaWidth: MIT_COLUMN_WIDTH,
      defaultOwnerJob: undefined,
      defaultOwnerId: undefined,
    };
  }

  const skillColumns: TimelineSkillColumn[] = [];
  const memberGroups: TimelineMemberGroup[] = [];
  const columnLefts: number[] = [];
  let cursor = 0;

  for (const member of members) {
    if (member.collapsed) {
      const group: TimelineMemberGroup = {
        member,
        skills: [],
        collapsed: true,
        width: COLLAPSED_MEMBER_WIDTH,
        left: cursor,
      };
      memberGroups.push(group);
      cursor += COLLAPSED_MEMBER_WIDTH;
      continue;
    }

    const memberSkills = skills
      .filter((skill) => isSkillAvailableForJob(skill, member.job))
      .map(
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

    const contentWidth = memberSkills.length * MIT_COLUMN_WIDTH;
    const groupWidth = Math.max(
      MIN_MEMBER_GROUP_WIDTH,
      contentWidth + MIT_MEMBER_GROUP_PADDING_X * 2,
    );
    const groupLeft = cursor;
    const groupContentLeft = groupLeft + (groupWidth - contentWidth) / 2;
    memberSkills.forEach((skill, index) => {
      columnLefts.push(groupContentLeft + index * MIT_COLUMN_WIDTH);
      skillColumns.push(skill);
    });
    cursor += groupWidth;
    memberGroups.push({
      member,
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
    headerSkillColumns,
    memberGroups,
    jobOrder,
    columnLefts,
    mitAreaWidth,
    defaultOwnerJob: jobOrder[0],
    defaultOwnerId: members[0]?.playerId,
  };
}
