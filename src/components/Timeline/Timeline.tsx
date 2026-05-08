import { useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/shallow';
import { useStore } from '../../store';
import { SKILLS } from '../../data/skills';
import { TimelineCanvas } from './TimelineCanvas';
import { MS_PER_SEC } from '../../constants/time';
import { CAST_LANE_WIDTH, DAMAGE_LANE_WIDTH } from '../../constants/timeline';
import { selectTimelineActions, selectTimelineState } from '../../store/selectors';
import { buildTimelineLayout } from './timelineLayout';
import { groupDamageEvents } from '../../domain/fflogs/groupDamageEvents';

interface TimelineProps {
  zoom: number;
  setZoom: (z: number) => void;
  containerId?: string;
  activeDragId?: string | null;
  dragPreviewPx?: number;
}

export function Timeline({
  zoom,
  setZoom,
  containerId = 'mit-lane-container',
  activeDragId,
  dragPreviewPx = 0,
}: TimelineProps) {
  const { fight, partyMembers, mitEvents, cooldownEvents, damageEventsByPlayerId, castEvents } =
    useStore(useShallow(selectTimelineState));
  const { setIsRendering } = useStore(useShallow(selectTimelineActions));

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsRendering(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [mitEvents, damageEventsByPlayerId, castEvents, setIsRendering]);

  const layout = useMemo(
    () =>
      buildTimelineLayout({
        members: partyMembers,
        skills: SKILLS,
      }),
    [partyMembers],
  );

  const groupedDamageEvents = useMemo(
    () => groupDamageEvents(damageEventsByPlayerId, partyMembers),
    [damageEventsByPlayerId, partyMembers],
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
        damageEvents={groupedDamageEvents}
        mitEvents={mitEvents}
        cooldownEvents={cooldownEvents}
        activeDragId={activeDragId}
        dragPreviewPx={dragPreviewPx}
      />
    </div>
  );
}
