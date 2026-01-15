import { MS_PER_SEC } from '../../constants/time';

export const CHAR_W = 7;
export const TRUNCATE_LEN = 12;
export const ROW_HEIGHT = 40;

const VISIBLE_CLUSTER_BUFFER_MS = 2000;

const EVENT_COLORS = {
  cast: {
    begincast: '#60A5FA',
    default: '#A78BFA'
  },
  damage: {
    mitigated: '#34D399',
    unmitigated: '#F87171'
  }
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
  const clusters: { events: T[]; startX: number; endX: number }[] = [];
  if (!events.length) return clusters;

  let currentCluster: T[] = [events[0]];
  let startX = (events[0].tMs / MS_PER_SEC) * zoom;
  let endX = startX;

  for (let i = 1; i < events.length; i++) {
    const ev = events[i];
    const x = (ev.tMs / MS_PER_SEC) * zoom;

    if (x - endX < gap) {
      currentCluster.push(ev);
      endX = x;
    } else {
      clusters.push({
        events: currentCluster,
        startX,
        endX
      });
      currentCluster = [ev];
      startX = x;
      endX = x;
    }
  }

  clusters.push({ events: currentCluster, startX, endX });
  return clusters;
}

export function getVisibleClusters<T extends { tMs: number }>(
  events: T[],
  zoom: number,
  visibleRange: { start: number; end: number },
  gap: number
) {
  const visible = events.filter(e => e.tMs >= visibleRange.start - VISIBLE_CLUSTER_BUFFER_MS && e.tMs <= visibleRange.end + VISIBLE_CLUSTER_BUFFER_MS);
  return clusterEvents(visible, zoom, gap);
}
