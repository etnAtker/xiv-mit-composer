import type { Job, MitEvent, Skill } from '../model/types';

// dnd-kit `data.current` 的数据约定 (payload contract)。
// 路由只看语义字段 (kind/timelineId/laneId)，不要解析字符串 id。
export type DragItemData =
  | { type: 'new-skill'; skill: Skill; ownerJob?: Job }
  | { type: 'existing-mit'; mit: MitEvent; sourceTimelineId: string };

export type DropZoneData =
  // `msPerPx` 用于把指针 Y 映射成时间轴时间，避免查 DOM；支持多实例/不同缩放。
  { kind: 'mit-lane'; timelineId: string; laneId: string; msPerPx: number } | { kind: 'trash' };

export function buildDropZoneId(zone: DropZoneData): string {
  if (zone.kind === 'trash') return 'trash';
  // 这里只做身份标识 (identity)。不要把 `msPerPx` 放进 id，否则缩放变化会导致 droppable 重新挂载 (remount)。
  return `mit-lane:${zone.timelineId}:${zone.laneId}`;
}
