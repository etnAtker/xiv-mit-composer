import { format } from 'date-fns';
import { memo, useMemo } from 'react';
import type { CastEvent, DamageEvent, MitEvent } from '../../model/types';
import type { TooltipData } from './types';
import { getCastColor, getDamageColor, getVisibleClusters, truncateText, TRUNCATE_LEN } from './timelineUtils';
import { MS_PER_SEC } from '../../constants/time';

const DAMAGE_AMOUNT_UNIT = 1000;
const DAMAGE_DECIMAL_PLACES = 0;

interface CastLaneProps {
  events: CastEvent[];
  zoom: number;
  height: number;
  top: number;
  visibleRange: { start: number; end: number };
  onHover: (data: TooltipData | null) => void;
}

export const CastLane = memo(({
  events,
  zoom,
  height,
  top,
  visibleRange,
  onHover
}: CastLaneProps) => {
  const visibleClusters = useMemo(() => {
    return getVisibleClusters(events, zoom, visibleRange, 15);
  }, [events, visibleRange, zoom]);

  return (
    <g transform={`translate(0, ${top})`}>
      <text x={10} y={-5} fill="#9CA3AF" fontSize={12} fontWeight="bold">读条 (Casts)</text>

      {visibleClusters.map((cluster, cIdx) => {
        const firstEv = cluster.events[0];
        const count = cluster.events.length;
        const labelText = count > 1
          ? `${truncateText(firstEv.ability.name, TRUNCATE_LEN)} (+${count - 1})`
          : truncateText(firstEv.ability.name, TRUNCATE_LEN);

        const hitX = cluster.startX - 5;
        const hitW = Math.max((cluster.endX - cluster.startX) + 15, 60);

        return (
          <g key={`c-${cIdx}`}>
            {cluster.events.map((ev, idx) => {
              const x = (ev.tMs / MS_PER_SEC) * zoom;
              const color = getCastColor(ev.type);
              return (
                <rect
                  key={`e-${idx}`}
                  x={x} y={0}
                  width={Math.max(2, (ev.duration || 0) / MS_PER_SEC * zoom)}
                  height={height}
                  fill={color}
                  opacity={0.6}
                />
              );
            })}

            <text
              x={cluster.startX}
              y={height + 12}
              fill={getCastColor(cluster.events[0].type)}
              fontSize={12}
              style={{ textAnchor: 'start' }}
              transform={`rotate(45, ${cluster.startX}, ${height + 12})`}
              className="pointer-events-none select-none opacity-90 font-medium"
            >
              {labelText}
            </text>

            <rect
              x={hitX}
              y={0}
              width={hitW}
              height={height + 50}
              fill="transparent"
              style={{ pointerEvents: 'all', cursor: 'help' }}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const barCenterOffset = 5 + (cluster.endX - cluster.startX) / 2;

                onHover({
                  x: rect.left + barCenterOffset,
                  y: rect.top - 5,
                  items: cluster.events.map(ev => ({
                    title: ev.ability.name,
                    subtitle: format(new Date(0, 0, 0, 0, 0, 0, ev.tMs), 'mm:ss.SS'),
                    color: getCastColor(ev.type)
                  }))
                });
              }}
              onMouseLeave={() => onHover(null)}
            />
          </g>
        );
      })}
    </g>
  );
});

interface DamageLaneProps {
  events: DamageEvent[];
  mitEvents: MitEvent[];
  zoom: number;
  height: number;
  top: number;
  visibleRange: { start: number; end: number };
  onHover: (data: TooltipData | null) => void;
  lineHeight: number;
}

export const DamageLane = memo(({
  events,
  mitEvents,
  zoom,
  height,
  top,
  visibleRange,
  onHover,
  lineHeight
}: DamageLaneProps) => {
  const visibleClusters = useMemo(() => {
    return getVisibleClusters(events, zoom, visibleRange, 18);
  }, [events, visibleRange, zoom]);

  return (
    <g transform={`translate(0, ${top})`}>
      <text x={10} y={-5} fill="#9CA3AF" fontSize={12} fontWeight="bold">承伤 (Damage)</text>

      {visibleClusters.map((cluster, cIdx) => {
        const firstEv = cluster.events[0];
        const count = cluster.events.length;

        const isCovered = cluster.events.some(ev => mitEvents.some(m => ev.tMs >= m.tStartMs && ev.tMs <= m.tEndMs));
        const color = getDamageColor(isCovered);

        const damageNumStr = (firstEv.unmitigatedAmount / DAMAGE_AMOUNT_UNIT).toFixed(DAMAGE_DECIMAL_PLACES);
        const damageStr = isNaN(Number(damageNumStr)) ? '???' : `${damageNumStr}k`;

        const labelText = count > 1
          ? `${damageStr} ${truncateText(firstEv.ability.name ? `(${firstEv.ability.name})` : '', TRUNCATE_LEN)} (+${count - 1})`
          : `${damageStr} ${truncateText(firstEv.ability.name ? `(${firstEv.ability.name})` : '', TRUNCATE_LEN + 5)}`;

        const hitX = cluster.startX - 8;
        const hitW = Math.max((cluster.endX - cluster.startX) + 16, 60);

        return (
          <g key={`c-${cIdx}`}>
            <line x1={cluster.startX} y1={-20} x2={cluster.startX} y2={lineHeight} stroke={color} strokeWidth={2} strokeDasharray="3 3" opacity={0.5} />

            {cluster.events.map((ev, idx) => {
              const x = (ev.tMs / MS_PER_SEC) * zoom;
              const covered = mitEvents.some(m => ev.tMs >= m.tStartMs && ev.tMs <= m.tEndMs);
              const subColor = getDamageColor(covered);
              return (
                <circle
                  key={`e-${idx}`}
                  cx={x} cy={height / 2} r={4}
                  fill={subColor}
                  stroke="rgba(0,0,0,0.2)"
                  strokeWidth={1}
                />
              );
            })}

            <text
              x={cluster.startX}
              y={height + 12}
              fill={color}
              fontSize={12}
              textAnchor="start"
              transform={`rotate(45, ${cluster.startX}, ${height + 12})`}
              fontWeight="bold"
              className="pointer-events-none select-none"
            >
              {labelText}
            </text>

            <rect
              x={hitX}
              y={0}
              width={hitW}
              height={height + 50}
              fill="transparent"
              style={{ pointerEvents: 'all', cursor: 'help' }}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const barCenterOffset = 8 + (cluster.endX - cluster.startX) / 2;

                onHover({
                  x: rect.left + barCenterOffset,
                  y: rect.top - 10,
                  items: cluster.events.map(ev => ({
                    title: `${(ev.unmitigatedAmount / DAMAGE_AMOUNT_UNIT).toFixed(DAMAGE_DECIMAL_PLACES)}k ${ev.ability.name}`,
                    subtitle: format(new Date(0, 0, 0, 0, 0, 0, ev.tMs), 'mm:ss.SS'),
                    color: getDamageColor(mitEvents.some(m => ev.tMs >= m.tStartMs && ev.tMs <= m.tEndMs))
                  }))
                });
              }}
              onMouseLeave={() => onHover(null)}
            />
          </g>
        );
      })}
    </g>
  );
});
