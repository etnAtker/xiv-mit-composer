import { MS_PER_SEC } from '../../constants/time';

export const CHAR_W = 7;
export const TRUNCATE_LEN = 12;
export const MIT_COLUMN_WIDTH = 120;
export const MIT_COLUMN_PADDING = 6;

const VISIBLE_CLUSTER_BUFFER_MS = 2000;

const EVENT_COLORS = {
  cast: {
    begincast: '#60A5FA',
    default: '#A78BFA',
  },
  damage: {
    mitigated: '#34D399',
    unmitigated: '#F87171',
  },
};

export const getCastColor = (type: string) =>
  type === 'begincast' ? EVENT_COLORS.cast.begincast : EVENT_COLORS.cast.default;

export const getDamageColor = (isMitigated: boolean) =>
  isMitigated ? EVENT_COLORS.damage.mitigated : EVENT_COLORS.damage.unmitigated;

export function truncateText(text: string, maxLength: number) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

export function clusterEvents<T extends { tMs: number }>(events: T[], zoom: number, gap: number) {
  const clusters: { events: T[]; startY: number; endY: number }[] = [];
  if (!events.length) return clusters;

  let currentCluster: T[] = [events[0]];
  let startY = (events[0].tMs / MS_PER_SEC) * zoom;
  let endY = startY;

  for (let i = 1; i < events.length; i++) {
    const ev = events[i];
    const y = (ev.tMs / MS_PER_SEC) * zoom;

    if (y - endY < gap) {
      currentCluster.push(ev);
      endY = y;
    } else {
      clusters.push({
        events: currentCluster,
        startY,
        endY,
      });
      currentCluster = [ev];
      startY = y;
      endY = y;
    }
  }

  clusters.push({ events: currentCluster, startY, endY });
  return clusters;
}

export function getVisibleClusters<T extends { tMs: number }>(
  events: T[],
  zoom: number,
  visibleRange: { start: number; end: number },
  gap: number,
) {
  const visible = events.filter(
    (e) =>
      e.tMs >= visibleRange.start - VISIBLE_CLUSTER_BUFFER_MS &&
      e.tMs <= visibleRange.end + VISIBLE_CLUSTER_BUFFER_MS,
  );
  return clusterEvents(visible, zoom, gap);
}
