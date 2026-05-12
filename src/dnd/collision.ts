import { rectIntersection } from '@dnd-kit/core';
import type { CollisionDescriptor, CollisionDetection } from '@dnd-kit/core';
import type { DropZoneData } from './types';

interface RectLike {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

export function getRectIntersectionArea(entry: RectLike, target: RectLike): number {
  const top = Math.max(target.top, entry.top);
  const left = Math.max(target.left, entry.left);
  const right = Math.min(target.right, entry.right);
  const bottom = Math.min(target.bottom, entry.bottom);

  if (left >= right || top >= bottom) {
    return 0;
  }

  return (right - left) * (bottom - top);
}

export const mitigationCollisionDetection: CollisionDetection = (args) => {
  const collisions = rectIntersection(args);
  if (collisions.length > 0) {
    return collisions;
  }

  const fallbackCollisions: CollisionDescriptor[] = [];
  for (const droppableContainer of args.droppableContainers) {
    const zone = droppableContainer.data.current as DropZoneData | undefined;
    if (zone?.kind !== 'mit-lane') continue;

    const rect = args.droppableRects.get(droppableContainer.id);
    if (!rect) continue;

    const intersectionArea = getRectIntersectionArea(rect, args.collisionRect);
    if (intersectionArea <= 0) continue;

    fallbackCollisions.push({
      id: droppableContainer.id,
      data: {
        droppableContainer,
        value: intersectionArea,
      },
    });
  }

  return fallbackCollisions.sort((a, b) => b.data.value - a.data.value);
};
