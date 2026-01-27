import { useEffect, useMemo } from 'react';
import { useStore } from '../../store';
import { ROLE_SKILL_IDS, SKILLS } from '../../data/skills';
import { TimelineCanvas } from './TimelineCanvas';
import { TimelineToolbar } from './TimelineToolbar';
import { MIT_COLUMN_WIDTH } from './timelineUtils';
import { MS_PER_SEC } from '../../constants/time';
import { CAST_LANE_WIDTH, DAMAGE_LANE_WIDTH } from '../../constants/timeline';
import type { Job } from '../../model/types';

interface TimelineProps {
  zoom: number;
  setZoom: (z: number) => void;
  containerId?: string;
  activeDragId?: string | null;
  dragDeltaMs?: number;
  selectedJobs?: Job[];
}

export function Timeline({
  zoom,
  setZoom,
  containerId = 'mit-lane-container',
  activeDragId,
  dragDeltaMs = 0,
  selectedJobs,
}: TimelineProps) {
  const {
    fight,
    selectedJob,
    mitEvents,
    damageEvents,
    damageEventsByJob,
    castEvents,
    setMitEvents,
    setIsRendering,
  } = useStore();

  const resolvedJobs = useMemo(() => {
    if (selectedJobs && selectedJobs.length > 0) {
      return Array.from(new Set(selectedJobs));
    }
    return selectedJob ? [selectedJob] : [];
  }, [selectedJob, selectedJobs]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsRendering(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [mitEvents, damageEvents, castEvents, setIsRendering]);

  const { columnMap, skillColumns, mitAreaWidth } = useMemo(() => {
    const jobs = resolvedJobs;
    const roleSkillIds = ROLE_SKILL_IDS;

    if (!jobs.length) {
      return { columnMap: {}, skillColumns: [], mitAreaWidth: MIT_COLUMN_WIDTH };
    }

    const jobColumns = jobs.flatMap((job) =>
      SKILLS.filter((s) => s.job === job || roleSkillIds.has(s.id)).map((skill) => ({
        id: skill.id,
        columnId: skill.job === 'ALL' ? `${skill.id}:${job}` : skill.id,
        name: skill.name,
        color: skill.color,
        icon: skill.icon,
        actionId: skill.actionId,
        job,
      })),
    );

    const utilityColumns = SKILLS.filter((s) => s.job === 'ALL' && !roleSkillIds.has(s.id)).map(
      (skill) => ({
        id: skill.id,
        columnId: skill.id,
        name: skill.name,
        color: skill.color,
        icon: skill.icon,
        actionId: skill.actionId,
        job: 'ALL',
      }),
    );

    const orderedSkills = [...jobColumns, ...utilityColumns];
    if (!orderedSkills.length) {
      return { columnMap: {}, skillColumns: [], mitAreaWidth: MIT_COLUMN_WIDTH };
    }

    const nextColumnMap: Record<string, number> = {};
    orderedSkills.forEach((skill, index) => {
      nextColumnMap[skill.columnId] = index;
    });

    const baseMitWidth = Math.max(MIT_COLUMN_WIDTH, orderedSkills.length * MIT_COLUMN_WIDTH);
    const extraDamageLaneWidth = jobs.length > 1 ? DAMAGE_LANE_WIDTH : 0;
    return {
      columnMap: nextColumnMap,
      skillColumns: orderedSkills,
      mitAreaWidth: baseMitWidth + extraDamageLaneWidth,
    };
  }, [resolvedJobs]);

  if (!fight) return null;

  const durationSec = fight.durationMs / MS_PER_SEC;
  const totalHeight = durationSec * zoom + 40;

  const RULER_W = 60;
  const CAST_X = RULER_W;
  const DMG_X = CAST_X + CAST_LANE_WIDTH;
  const MIT_X = DMG_X + DAMAGE_LANE_WIDTH;

  const totalWidth = MIT_X + mitAreaWidth;

  const primaryJob = resolvedJobs[0];
  const secondaryJob = resolvedJobs[1];
  const primaryDamageEvents =
    resolvedJobs.length > 1 && primaryJob ? (damageEventsByJob?.[primaryJob] ?? []) : damageEvents;
  const secondaryDamageEvents =
    resolvedJobs.length > 1 && secondaryJob ? (damageEventsByJob?.[secondaryJob] ?? []) : [];

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-app text-app font-['Space_Grotesk']">
      <TimelineToolbar zoom={zoom} setZoom={setZoom} onClear={() => setMitEvents([])} />
      <TimelineCanvas
        containerId={containerId}
        zoom={zoom}
        setZoom={setZoom}
        durationSec={durationSec}
        totalWidth={totalWidth}
        totalHeight={totalHeight}
        rulerWidth={RULER_W}
        castWidth={CAST_LANE_WIDTH}
        castX={CAST_X}
        dmgWidth={DAMAGE_LANE_WIDTH}
        dmgX={DMG_X}
        mitX={MIT_X}
        mitAreaWidth={mitAreaWidth}
        skillColumns={skillColumns}
        castEvents={castEvents}
        damageEvents={primaryDamageEvents}
        secondaryDamageEvents={secondaryDamageEvents}
        mitEvents={mitEvents}
        columnMap={columnMap}
        activeDragId={activeDragId}
        dragDeltaMs={dragDeltaMs}
        selectedJobs={resolvedJobs.length ? resolvedJobs : undefined}
      />
    </div>
  );
}
