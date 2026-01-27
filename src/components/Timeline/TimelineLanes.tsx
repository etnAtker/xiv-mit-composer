import { format } from 'date-fns';
import { memo, useMemo } from 'react';
import type { CastEvent, DamageEvent, MitEvent } from '../../model/types';
import type { TooltipData } from './types';
import {
  getCastColor,
  getDamageColor,
  getVisibleClusters,
  truncateText,
  TRUNCATE_LEN,
} from './timelineUtils';
import { MS_PER_SEC } from '../../constants/time';

const DAMAGE_AMOUNT_UNIT = 1000;
const DAMAGE_DECIMAL_PLACES = 0;

interface CastLaneProps {
  events: CastEvent[];
  zoom: number;
  width: number;
  left: number;
  visibleRange: { start: number; end: number };
  onHover: (data: TooltipData | null) => void;
}

export const CastLane = memo(
  ({ events, zoom, width, left, visibleRange, onHover }: CastLaneProps) => {
    const visibleClusters = useMemo(() => {
      return getVisibleClusters(events, zoom, visibleRange, 15);
    }, [events, visibleRange, zoom]);

    return (
      <g transform={`translate(${left}, 0)`}>
        {visibleClusters.map((cluster, cIdx) => {
          const firstEv = cluster.events[0];
          const count = cluster.events.length;
          const labelText =
            count > 1
              ? `${truncateText(firstEv.ability.name, TRUNCATE_LEN)} (+${count - 1})`
              : truncateText(firstEv.ability.name, TRUNCATE_LEN);

          const barWidth = Math.max(20, width - 16);
          const hitY = cluster.startY - 8;
          const hitH = Math.max(cluster.endY - cluster.startY + 16, 40);

          return (
            <g key={`c-${cIdx}`}>
              {cluster.events.map((ev, idx) => {
                const y = (ev.tMs / MS_PER_SEC) * zoom;
                const color = getCastColor(ev.type);
                return (
                  <rect
                    key={`e-${idx}`}
                    x={8}
                    y={y}
                    width={barWidth}
                    height={Math.max(2, ((ev.duration || 0) / MS_PER_SEC) * zoom)}
                    fill={color}
                    opacity={0.55}
                  />
                );
              })}

              <text
                x={8}
                y={cluster.startY + 12}
                fill={getCastColor(cluster.events[0].type)}
                fontSize={11}
                textAnchor="start"
                className="pointer-events-none select-none font-['Space_Grotesk'] font-medium tracking-tight opacity-90"
              >
                {labelText}
              </text>

              <rect
                x={0}
                y={hitY}
                width={width}
                height={hitH}
                fill="transparent"
                style={{ pointerEvents: 'all', cursor: 'help' }}
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const barCenterOffset = 8 + (cluster.endY - cluster.startY) / 2;

                  onHover({
                    x: rect.left + width / 2,
                    y: rect.top + barCenterOffset,
                    items: cluster.events.map((ev) => ({
                      title: ev.ability.name,
                      subtitle: format(new Date(0, 0, 0, 0, 0, 0, ev.tMs), 'mm:ss.SS'),
                      color: getCastColor(ev.type),
                    })),
                  });
                }}
                onMouseLeave={() => onHover(null)}
              />
            </g>
          );
        })}
      </g>
    );
  },
);

interface DamageLaneProps {
  events: DamageEvent[];
  mitEvents: MitEvent[];
  zoom: number;
  width: number;
  left: number;
  visibleRange: { start: number; end: number };
  onHover: (data: TooltipData | null) => void;
  lineWidth: number;
}

interface DamageLaneHitTargetsProps {
  events: DamageEvent[];
  mitEvents: MitEvent[];
  zoom: number;
  width: number;
  left: number;
  visibleRange: { start: number; end: number };
  onHover: (data: TooltipData | null) => void;
}

const mergeMitWindows = (mitEvents: MitEvent[]) => {
  if (mitEvents.length === 0) return [];
  const sorted = mitEvents
    .map((mit) => ({
      start: mit.tStartMs,
      end: mit.tEndMs,
    }))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const merged: { start: number; end: number }[] = [];
  for (const window of sorted) {
    const last = merged[merged.length - 1];
    if (!last || window.start > last.end) {
      merged.push({ ...window });
      continue;
    }
    if (window.end > last.end) {
      last.end = window.end;
    }
  }
  return merged;
};

const isMitigatedAt = (windows: { start: number; end: number }[], tMs: number) => {
  if (windows.length === 0) {
    return false;
  }
  let left = 0;
  let right = windows.length - 1;
  while (left <= right) {
    const mid = (left + right) >> 1;
    const window = windows[mid];
    if (tMs < window.start) {
      right = mid - 1;
    } else if (tMs > window.end) {
      left = mid + 1;
    } else {
      return true;
    }
  }
  return false;
};

export const DamageLane = memo(
  ({ events, mitEvents, zoom, width, left, visibleRange, onHover, lineWidth }: DamageLaneProps) => {
    const mergedMitWindows = useMemo(() => mergeMitWindows(mitEvents), [mitEvents]);

    const visibleClusters = useMemo(() => {
      return getVisibleClusters(events, zoom, visibleRange, 18);
    }, [events, visibleRange, zoom]);

    return (
      <g transform={`translate(${left}, 0)`}>
        {visibleClusters.map((cluster, cIdx) => {
          const firstEv = cluster.events[0];
          const count = cluster.events.length;

          const isCovered = cluster.events.some((ev) => isMitigatedAt(mergedMitWindows, ev.tMs));
          const color = getDamageColor(isCovered);

          const damageNumStr = (firstEv.unmitigatedAmount / DAMAGE_AMOUNT_UNIT).toFixed(
            DAMAGE_DECIMAL_PLACES,
          );
          const damageStr = isNaN(Number(damageNumStr)) ? '???' : `${damageNumStr}k`;

          const skillName = firstEv.ability.name ? firstEv.ability.name : '';
          const skillLabelText =
            count > 1
              ? `${truncateText(skillName, TRUNCATE_LEN)} (+${count - 1})`
              : truncateText(skillName, TRUNCATE_LEN + 5);
          const lineY = cluster.startY;

          const hitY = cluster.startY - 8;
          const hitH = Math.max(cluster.endY - cluster.startY + 16, 40);

          return (
            <g key={`c-${cIdx}`}>
              <line
                x1={0}
                y1={lineY}
                x2={lineWidth}
                y2={lineY}
                stroke={color}
                strokeWidth={2}
                strokeDasharray="4 4"
                opacity={0.5}
              />

              {cluster.events.map((ev, idx) => {
                const y = (ev.tMs / MS_PER_SEC) * zoom;
                const covered = isMitigatedAt(mergedMitWindows, ev.tMs);
                const subColor = getDamageColor(covered);
                return (
                  <circle
                    key={`e-${idx}`}
                    cx={width / 2}
                    cy={y}
                    r={4}
                    fill={subColor}
                    stroke="rgba(255,255,255,0.16)"
                    strokeWidth={1}
                  />
                );
              })}

              <text
                x={8}
                y={lineY}
                dy="-0.4em"
                fill={color}
                fontSize={11}
                textAnchor="start"
                fontWeight={600}
                className="pointer-events-none select-none font-['Space_Grotesk'] tracking-tight"
              >
                {skillLabelText}
              </text>
              <text
                x={8}
                y={lineY}
                dy="1em"
                fill={color}
                fontSize={11}
                textAnchor="start"
                fontWeight={600}
                className="pointer-events-none select-none font-['Space_Grotesk'] tracking-tight"
              >
                {damageStr}
              </text>

              <rect
                x={0}
                y={hitY}
                width={width}
                height={hitH}
                fill="rgba(0,0,0,0.001)"
                pointerEvents="all"
                style={{ cursor: 'help' }}
                onPointerEnter={(e) => {
                  onHover({
                    x: e.clientX,
                    y: e.clientY,
                    items: cluster.events.map((ev) => ({
                      title: `${(ev.unmitigatedAmount / DAMAGE_AMOUNT_UNIT).toFixed(DAMAGE_DECIMAL_PLACES)}k ${ev.ability.name}`,
                      subtitle: format(new Date(0, 0, 0, 0, 0, 0, ev.tMs), 'mm:ss.SS'),
                      color: getDamageColor(isMitigatedAt(mergedMitWindows, ev.tMs)),
                    })),
                  });
                }}
                onPointerMove={(e) => {
                  onHover({
                    x: e.clientX,
                    y: e.clientY,
                    items: cluster.events.map((ev) => ({
                      title: `${(ev.unmitigatedAmount / DAMAGE_AMOUNT_UNIT).toFixed(DAMAGE_DECIMAL_PLACES)}k ${ev.ability.name}`,
                      subtitle: format(new Date(0, 0, 0, 0, 0, 0, ev.tMs), 'mm:ss.SS'),
                      color: getDamageColor(isMitigatedAt(mergedMitWindows, ev.tMs)),
                    })),
                  });
                }}
                onPointerLeave={() => onHover(null)}
              />
            </g>
          );
        })}
      </g>
    );
  },
);

export const DamageLaneHitTargets = memo(
  ({ events, mitEvents, zoom, width, left, visibleRange, onHover }: DamageLaneHitTargetsProps) => {
    const mergedMitWindows = useMemo(() => mergeMitWindows(mitEvents), [mitEvents]);
    const visibleClusters = useMemo(() => {
      return getVisibleClusters(events, zoom, visibleRange, 18);
    }, [events, visibleRange, zoom]);

    return (
      <div
        className="absolute top-0 h-full pointer-events-none"
        style={{ left, width }}
        aria-hidden="true"
      >
        {visibleClusters.map((cluster, cIdx) => {
          const hitY = cluster.startY - 8;
          const hitH = Math.max(cluster.endY - cluster.startY + 16, 40);

          return (
            <div
              key={`hit-${cIdx}`}
              className="absolute left-0 pointer-events-auto"
              style={{
                top: hitY,
                width,
                height: hitH,
                cursor: 'help',
              }}
              onMouseEnter={(e) => {
                onHover({
                  x: e.clientX,
                  y: e.clientY,
                  items: cluster.events.map((ev) => ({
                    title: `${(ev.unmitigatedAmount / DAMAGE_AMOUNT_UNIT).toFixed(DAMAGE_DECIMAL_PLACES)}k ${ev.ability.name}`,
                    subtitle: format(new Date(0, 0, 0, 0, 0, 0, ev.tMs), 'mm:ss.SS'),
                    color: getDamageColor(isMitigatedAt(mergedMitWindows, ev.tMs)),
                  })),
                });
              }}
              onMouseMove={(e) => {
                onHover({
                  x: e.clientX,
                  y: e.clientY,
                  items: cluster.events.map((ev) => ({
                    title: `${(ev.unmitigatedAmount / DAMAGE_AMOUNT_UNIT).toFixed(DAMAGE_DECIMAL_PLACES)}k ${ev.ability.name}`,
                    subtitle: format(new Date(0, 0, 0, 0, 0, 0, ev.tMs), 'mm:ss.SS'),
                    color: getDamageColor(isMitigatedAt(mergedMitWindows, ev.tMs)),
                  })),
                });
              }}
              onMouseLeave={() => onHover(null)}
            />
          );
        })}
      </div>
    );
  },
);
