import type { TimelineSkillColumn } from './types';
import { DAMAGE_LANE_WIDTH } from '../../constants/timeline';
import { MIT_COLUMN_WIDTH } from './timelineUtils';

interface Props {
  rulerWidth: number;
  castWidth: number;
  dmgWidth: number;
  mitAreaWidth: number;
  dmgX: number;
  secondaryDamageLaneLeft: number;
  headerSkillColumns: TimelineSkillColumn[];
  hasSecondaryDamageLane: boolean;
  firstGroupCount: number;
}

export function TimelineBackground({
  rulerWidth,
  castWidth,
  dmgWidth,
  mitAreaWidth,
  dmgX,
  secondaryDamageLaneLeft,
  headerSkillColumns,
  hasSecondaryDamageLane,
  firstGroupCount,
}: Props) {
  return (
    <>
      <div className="absolute inset-0 z-0 flex pointer-events-none">
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
          {headerSkillColumns.flatMap((skill, index) => {
            const blocks = [];
            if (hasSecondaryDamageLane && index === firstGroupCount) {
              blocks.push(
                <div
                  key="secondary-damage-lane-gap"
                  className="h-full"
                  style={{ width: DAMAGE_LANE_WIDTH }}
                />,
              );
            }
            blocks.push(
              <div
                key={`lane-${skill.columnId}`}
                className="h-full border-r border-app"
                style={{ width: MIT_COLUMN_WIDTH }}
              />,
            );
            return blocks;
          })}
        </div>
      </div>

      <div className="absolute inset-0 z-0 pointer-events-none">
        <div
          className="absolute top-0 h-full border-r border-app bg-surface-2"
          style={{
            left: dmgX,
            width: dmgWidth,
            backgroundSize: '100% 60px',
            backgroundImage: 'linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)',
          }}
        />
        {hasSecondaryDamageLane && (
          <div
            className="absolute top-0 h-full border-r border-app bg-surface-2"
            style={{
              left: secondaryDamageLaneLeft,
              width: dmgWidth,
              backgroundSize: '100% 60px',
              backgroundImage:
                'linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)',
            }}
          />
        )}
      </div>
    </>
  );
}
