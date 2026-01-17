import { useEffect, useMemo } from 'react';
import { useStore } from '../../store';
import { SKILLS } from '../../data/skills';
import { TimelineCanvas } from './TimelineCanvas';
import { TimelineToolbar } from './TimelineToolbar';
import { CD_LEFT_PADDING, MIT_COLUMN_PADDING, MIT_COLUMN_WIDTH } from './timelineUtils';
import { MS_PER_SEC } from '../../constants/time';
import { CAST_LANE_WIDTH, DAMAGE_LANE_WIDTH } from '../../constants/timeline';

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
  dragDeltaMs = 0,
}: TimelineProps) {
  const { fight, mitEvents, damageEvents, castEvents, setMitEvents, setIsRendering } = useStore();

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsRendering(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [mitEvents, damageEvents, castEvents, setIsRendering]);

  const { columnMap, skillColumns, mitAreaWidth } = useMemo(() => {
    if (!mitEvents.length) {
      return { columnMap: {}, skillColumns: [], mitAreaWidth: MIT_COLUMN_WIDTH };
    }

    const skillIds = Array.from(new Set(mitEvents.map((m) => m.skillId))).sort((a, b) => {
      const indexA = SKILLS.findIndex((s) => s.id === a);
      const indexB = SKILLS.findIndex((s) => s.id === b);
      return indexA - indexB;
    });
    const nextColumnMap: Record<string, number> = {};
    const columns = skillIds.map((sid, index) => {
      nextColumnMap[sid] = index;
      const skillDef = SKILLS.find((s) => s.id === sid);
      return { id: sid, name: skillDef?.name || 'Unknown' };
    });

    return {
      columnMap: nextColumnMap,
      skillColumns: columns,
      mitAreaWidth: Math.max(MIT_COLUMN_WIDTH, columns.length * MIT_COLUMN_WIDTH),
    };
  }, [mitEvents]);

  const cdZones = useMemo(() => {
    if (!mitEvents.length) return [];
    const zones: React.ReactElement[] = [];
    const bySkill: Record<string, typeof mitEvents> = {};

    mitEvents.forEach((m) => {
      if (m.id === activeDragId) return;
      if (!bySkill[m.skillId]) bySkill[m.skillId] = [];
      bySkill[m.skillId].push(m);
    });

    Object.entries(bySkill).forEach(([skillId, events]) => {
      const skillDef = SKILLS.find((s) => s.id === skillId);
      if (!skillDef || !skillDef.cooldownSec) return;

      const columnIndex = columnMap[skillId];
      if (columnIndex === undefined) return;

      const columnX = columnIndex * MIT_COLUMN_WIDTH + MIT_COLUMN_PADDING;
      const zoneWidth = MIT_COLUMN_WIDTH - MIT_COLUMN_PADDING * 2;
      const cdBoxY = zoneWidth + CD_LEFT_PADDING;

      events.forEach((ev) => {
        const startY = (ev.tStartMs / MS_PER_SEC) * zoom;
        const height = skillDef.cooldownSec * zoom;

        zones.push(
          <g key={`cd-${ev.id}`} transform={`translate(${columnX}, ${startY})`}>
            <rect
              x={0}
              y={0}
              width={cdBoxY}
              height={height}
              fill="url(#diagonalHatch)"
              opacity={0.6}
            />
            <line
              x1={cdBoxY}
              y1={0}
              x2={cdBoxY}
              y2={height}
              stroke="#EF4444"
              strokeWidth={2}
              opacity={0.6}
            />
            <text x={4} y={12} fill="#6B7280" fontSize={9} className="select-none">
              CD
            </text>
          </g>,
        );
      });
    });

    return zones;
  }, [mitEvents, zoom, columnMap, activeDragId]);

  if (!fight) return null;

  const durationSec = fight.durationMs / MS_PER_SEC;
  const totalHeight = durationSec * zoom + 40;

  const RULER_W = 72;
  const CAST_X = RULER_W;
  const DMG_X = CAST_X + CAST_LANE_WIDTH;
  const MIT_X = DMG_X + DAMAGE_LANE_WIDTH;

  const totalWidth = MIT_X + mitAreaWidth;

  return (
    <div className="flex flex-col h-full bg-gray-950 relative">
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
        damageEvents={damageEvents}
        mitEvents={mitEvents}
        cdZones={cdZones}
        columnMap={columnMap}
        activeDragId={activeDragId}
        dragDeltaMs={dragDeltaMs}
      />
    </div>
  );
}
