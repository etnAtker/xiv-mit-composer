import type { TimelineSkillColumn } from './types';
import { MIT_COLUMN_WIDTH, RESOURCE_COLUMN_WIDTH } from './timelineUtils';
import type { TimelineMemberGroup } from './timelineLayout';

interface Props {
  rulerWidth: number;
  castWidth: number;
  dmgWidth: number;
  mitAreaWidth: number;
  dmgX: number;
  headerSkillColumns: TimelineSkillColumn[];
  memberGroups: TimelineMemberGroup[];
  timelineHeight: number;
}

export function TimelineBackground({
  rulerWidth,
  castWidth,
  dmgWidth,
  mitAreaWidth,
  dmgX,
  headerSkillColumns,
  memberGroups,
  timelineHeight,
}: Props) {
  return (
    <>
      <div
        className="absolute left-0 top-0 z-0 flex pointer-events-none"
        style={{ width: '100%', height: timelineHeight }}
      >
        <div
          className="h-full border-r border-app bg-surface-2"
          style={{
            width: rulerWidth,
            backgroundSize: '100% 60px',
            backgroundImage: 'linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)',
          }}
        />
        <div className="h-full" style={{ width: castWidth }} />
        <div className="h-full" style={{ width: dmgWidth }} />
        <div className="flex h-full" style={{ width: mitAreaWidth }}>
          {memberGroups.map((group) => {
            if (group.collapsed) {
              return (
                <div
                  key={`collapsed-${group.member.playerId}`}
                  className="h-full bg-surface-2/70"
                  style={{ width: group.width }}
                />
              );
            }

            return (
              <div
                key={`member-bg-${group.member.playerId}`}
                className="h-full"
                style={{ width: group.width }}
              >
                <div className="flex h-full justify-center">
                  {group.resourceColumns.map((resource, index) => (
                    <div
                      key={`resource-lane-${resource.columnId}`}
                      className={`h-full border-r border-app bg-surface-2/40 ${
                        index === 0 ? 'border-l' : ''
                      }`}
                      style={{ width: RESOURCE_COLUMN_WIDTH }}
                    />
                  ))}
                  {group.skills.map((skill, index) => (
                    <div
                      key={`lane-${skill.columnId}`}
                      className={`h-full border-r border-app ${
                        index === 0 && group.resourceColumns.length === 0 ? 'border-l' : ''
                      }`}
                      style={{ width: MIT_COLUMN_WIDTH }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
          {memberGroups.length === 0 &&
            headerSkillColumns.map((skill) => (
              <div
                key={`lane-${skill.columnId}`}
                className="h-full border-r border-app"
                style={{ width: MIT_COLUMN_WIDTH }}
              />
            ))}
        </div>
      </div>

      <div
        className="absolute left-0 top-0 z-0 pointer-events-none"
        style={{ width: '100%', height: timelineHeight }}
      >
        <div
          className="absolute top-0 h-full border-r border-app bg-surface-2"
          style={{
            left: dmgX,
            width: dmgWidth,
            backgroundSize: '100% 60px',
            backgroundImage: 'linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)',
          }}
        />
      </div>
    </>
  );
}
