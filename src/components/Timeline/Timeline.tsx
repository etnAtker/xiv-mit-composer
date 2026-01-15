import { useEffect, useMemo } from 'react';
import { useStore } from '../../store';
import { SKILLS } from '../../data/skills';
import { TimelineCanvas } from './TimelineCanvas';
import { TimelineToolbar } from './TimelineToolbar';
import { CHAR_W, ROW_HEIGHT, TRUNCATE_LEN } from './timelineUtils';
import { MS_PER_SEC } from '../../constants/time';
import { DAMAGE_LANE_HEIGHT } from '../../constants/timeline';

interface TimelineProps {
  zoom: number;
  setZoom: (z: number) => void;
  containerId?: string;
  activeDragId?: string | null;
  dragDeltaMs?: number;
}

export function Timeline({
  zoom,
  setZoom,
  containerId = 'mit-lane-container',
  activeDragId,
  dragDeltaMs = 0
}: TimelineProps) {
  const {
    fight,
    mitEvents,
    damageEvents,
    castEvents,
    setMitEvents,
    setIsRendering
  } = useStore();

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsRendering(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [mitEvents, damageEvents, castEvents, setIsRendering]);

  const { rowMap, totalRowHeight } = useMemo(() => {
    if (!mitEvents.length) return { rowMap: {}, totalRowHeight: 60 };

    const skillIds = Array.from(new Set(mitEvents.map(m => m.skillId)));
    const nextRowMap: Record<string, number> = {};
    skillIds.forEach((sid, index) => {
      nextRowMap[sid] = index;
    });

    return {
      rowMap: nextRowMap,
      totalRowHeight: Math.max(60, skillIds.length * ROW_HEIGHT)
    };
  }, [mitEvents]);

  const cdZones = useMemo(() => {
    if (!mitEvents.length) return [];
    const zones: React.ReactElement[] = [];
    const bySkill: Record<string, typeof mitEvents> = {};

    mitEvents.forEach(m => {
      if (m.id === activeDragId) return;
      if (!bySkill[m.skillId]) bySkill[m.skillId] = [];
      bySkill[m.skillId].push(m);
    });

    Object.entries(bySkill).forEach(([skillId, events]) => {
      const skillDef = SKILLS.find(s => s.id === skillId);
      if (!skillDef || !skillDef.cooldownSec) return;

      const rowIndex = rowMap[skillId];
      if (rowIndex === undefined) return;

      const rowY = rowIndex * ROW_HEIGHT;

      events.forEach(ev => {
        const startX = (ev.tStartMs / MS_PER_SEC) * zoom;
        const width = skillDef.cooldownSec * zoom;

        zones.push(
          <g key={`cd-${ev.id}`} transform={`translate(${startX}, ${rowY})`}>
            <rect x={0} y={5} width={width} height={30} fill="url(#diagonalHatch)" opacity={0.3} />
            <line x1={0} y1={35} x2={width} y2={35} stroke="#EF4444" strokeWidth={2} opacity={0.6} />
            <text x={5} y={30} fill="#6B7280" fontSize={9} className="select-none pointer-events-none">CD</text>
          </g>
        );
      });
    });

    return zones;
  }, [mitEvents, zoom, rowMap, activeDragId]);

  const { castGap, dmgGap } = useMemo(() => {
    const castMaxLenPx = (TRUNCATE_LEN + 3) * CHAR_W + 20;
    const castExtraH = castMaxLenPx * 0.707;

    const dmgMaxLenPx = (5 + TRUNCATE_LEN + 5 + 3) * CHAR_W + 20;
    const dmgExtraH = dmgMaxLenPx * 0.707;

    return {
      castGap: Math.max(50, castExtraH),
      dmgGap: Math.max(80, dmgExtraH)
    };
  }, []);

  if (!fight) return null;

  const durationSec = fight.durationMs / MS_PER_SEC;
  const totalWidth = durationSec * zoom;

  const RULER_H = 30;
  const CAST_H = 60;

  const CAST_Y = RULER_H + 20;
  const DMG_Y = CAST_Y + CAST_H + castGap;
  const MIT_Y = DMG_Y + DAMAGE_LANE_HEIGHT + dmgGap;

  const MIT_AREA_H = Math.max(100, totalRowHeight + 40);
  const TOTAL_SVG_HEIGHT = MIT_Y + MIT_AREA_H + 50;

  return (
    <div className="flex flex-col h-full bg-gray-950 relative">
      <TimelineToolbar
        zoom={zoom}
        setZoom={setZoom}
        onClear={() => setMitEvents([])}
      />
      <TimelineCanvas
        containerId={containerId}
        zoom={zoom}
        setZoom={setZoom}
        durationSec={durationSec}
        totalWidth={totalWidth}
        totalHeight={TOTAL_SVG_HEIGHT}
        castHeight={CAST_H}
        castY={CAST_Y}
        dmgY={DMG_Y}
        mitY={MIT_Y}
        mitAreaHeight={MIT_AREA_H}
        castEvents={castEvents}
        damageEvents={damageEvents}
        mitEvents={mitEvents}
        cdZones={cdZones}
        rowMap={rowMap}
        activeDragId={activeDragId}
        dragDeltaMs={dragDeltaMs}
      />
    </div>
  );
}
