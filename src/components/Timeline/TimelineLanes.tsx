import { format } from 'date-fns';
import { memo, useMemo } from 'react';
import type { GroupedDamageEvent, MitEvent } from '../../model/types';
import type { TooltipData } from './types';
import { getDamageColor, getVisibleClusters, truncateText, TRUNCATE_LEN } from './timelineUtils';
import { MS_PER_SEC } from '../../constants/time';
import { JOB_ICON_LOCAL_SRC } from '../../data/icons';

const DAMAGE_AMOUNT_UNIT = 1000;
const DAMAGE_DECIMAL_PLACES = 0;

interface DamageLaneProps {
  events: GroupedDamageEvent[];
  mitEvents: MitEvent[];
  zoom: number;
  width: number;
  left: number;
  visibleRange: { start: number; end: number };
  lineWidth: number;
}

interface DamageLaneHitTargetsProps {
  events: GroupedDamageEvent[];
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

const formatDamageK = (amount: number) => {
  if (!Number.isFinite(amount)) return '???';
  return `${(amount / DAMAGE_AMOUNT_UNIT).toFixed(DAMAGE_DECIMAL_PLACES)}k`;
};

const formatDamageRaw = (amount: number) => {
  if (!Number.isFinite(amount)) return '???';
  return Math.round(amount).toLocaleString();
};

export const DamageLane = memo(
  ({ events, mitEvents, zoom, width, left, visibleRange, lineWidth }: DamageLaneProps) => {
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

          const damageStr = formatDamageK(firstEv.displayAmount);

          const skillName = firstEv.ability.name ? firstEv.ability.name : '';
          const skillLabelText =
            count > 1
              ? `${truncateText(skillName, TRUNCATE_LEN)} (+${count - 1})`
              : truncateText(skillName, TRUNCATE_LEN + 5);
          const lineY = cluster.startY;

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
                    title: `${formatDamageK(ev.displayAmount)} ${ev.ability.name}`,
                    subtitle: `${format(new Date(0, 0, 0, 0, 0, 0, ev.tMs), 'mm:ss.SS')} · ${ev.hits.length} 人命中`,
                    color: getDamageColor(isMitigatedAt(mergedMitWindows, ev.tMs)),
                    icon: JOB_ICON_LOCAL_SRC[ev.hits[0]?.job],
                  })),
                });
              }}
              onMouseMove={(e) => {
                onHover({
                  x: e.clientX,
                  y: e.clientY,
                  items: cluster.events.map((ev) => ({
                    title: `${formatDamageK(ev.displayAmount)} ${ev.ability.name}`,
                    subtitle: ev.hits
                      .map((hit) => {
                        const offset = hit.tMs - ev.tMs;
                        const offsetLabel =
                          offset === 0 ? '+0ms' : `${offset > 0 ? '+' : ''}${offset}ms`;
                        return `${hit.playerName} ${formatDamageRaw(hit.unmitigatedAmount)} @ ${format(new Date(0, 0, 0, 0, 0, 0, hit.tMs), 'mm:ss.SS')} ${offsetLabel}`;
                      })
                      .join('\n'),
                    color: getDamageColor(isMitigatedAt(mergedMitWindows, ev.tMs)),
                    icon: JOB_ICON_LOCAL_SRC[ev.hits[0]?.job],
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
