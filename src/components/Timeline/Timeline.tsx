import { useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/shallow';
import { useStore } from '../../store';
import { ROLE_SKILL_IDS, SKILLS } from '../../data/skills';
import { TimelineCanvas } from './TimelineCanvas';
import { MS_PER_SEC } from '../../constants/time';
import { CAST_LANE_WIDTH, DAMAGE_LANE_WIDTH } from '../../constants/timeline';
import type { Job } from '../../model/types';
import { selectTimelineActions, selectTimelineState } from '../../store/selectors';
import { buildTimelineLayout } from './timelineLayout';

interface TimelineProps {
  zoom: number;
  setZoom: (z: number) => void;
  containerId?: string;
  activeDragId?: string | null;
  dragPreviewPx?: number;
  selectedJobs?: Job[];
}

export function Timeline({
  zoom,
  setZoom,
  containerId = 'mit-lane-container',
  activeDragId,
  dragPreviewPx = 0,
  selectedJobs,
}: TimelineProps) {
  const { fight, selectedJob, mitEvents, damageEvents, damageEventsByJob, castEvents } = useStore(
    useShallow(selectTimelineState),
  );
  const { setIsRendering } = useStore(useShallow(selectTimelineActions));

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

  const layout = useMemo(
    () =>
      buildTimelineLayout({
        jobs: resolvedJobs,
        skills: SKILLS,
        roleSkillIds: ROLE_SKILL_IDS,
      }),
    [resolvedJobs],
  );

  const lastCastEndMs = useMemo(() => {
    const toDurationMs = (duration?: number) => {
      if (!duration || duration <= 0) return 0;
      return duration < 100 ? duration * MS_PER_SEC : duration;
    };

    const hasBeginCast = castEvents.some((ev) => ev.type === 'begincast');
    let maxEndMs = 0;
    for (const ev of castEvents) {
      const durationMs = toDurationMs(ev.duration);
      const endMs =
        ev.type === 'begincast'
          ? ev.tMs + durationMs
          : durationMs > 0 && !hasBeginCast
            ? ev.tMs + durationMs
            : ev.tMs;
      if (endMs > maxEndMs) maxEndMs = endMs;
    }
    return maxEndMs;
  }, [castEvents]);

  if (!fight) return null;

  const timelineEndMs = fight.durationMs;
  const renderEndMs = Math.max(timelineEndMs, lastCastEndMs);
  const durationSec = timelineEndMs / MS_PER_SEC;
  const timelineHeight = durationSec * zoom + 40;
  const totalHeight = (renderEndMs / MS_PER_SEC) * zoom + 40;

  const RULER_W = 60;
  const CAST_X = RULER_W;
  const DMG_X = CAST_X + CAST_LANE_WIDTH;
  const MIT_X = DMG_X + DAMAGE_LANE_WIDTH;

  const totalWidth = MIT_X + layout.mitAreaWidth;

  const primaryJob = layout.primaryJob;
  const secondaryJob = layout.secondaryJob;
  const primaryDamageEvents =
    layout.hasSecondaryDamageLane && primaryJob
      ? (damageEventsByJob?.[primaryJob] ?? [])
      : damageEvents;
  const secondaryDamageEvents =
    layout.hasSecondaryDamageLane && secondaryJob ? (damageEventsByJob?.[secondaryJob] ?? []) : [];

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-app text-app font-['Space_Grotesk']">
      <TimelineCanvas
        containerId={containerId}
        zoom={zoom}
        setZoom={setZoom}
        timelineHeight={timelineHeight}
        durationSec={durationSec}
        totalWidth={totalWidth}
        totalHeight={totalHeight}
        rulerWidth={RULER_W}
        castWidth={CAST_LANE_WIDTH}
        castX={CAST_X}
        dmgWidth={DAMAGE_LANE_WIDTH}
        dmgX={DMG_X}
        mitX={MIT_X}
        layout={layout}
        castEvents={castEvents}
        damageEvents={primaryDamageEvents}
        secondaryDamageEvents={secondaryDamageEvents}
        mitEvents={mitEvents}
        activeDragId={activeDragId}
        dragPreviewPx={dragPreviewPx}
      />
    </div>
  );
}
