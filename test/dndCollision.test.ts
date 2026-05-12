import test from 'node:test';
import assert from 'node:assert/strict';

import type { CollisionDetection } from '@dnd-kit/core';
import { getRectIntersectionArea, mitigationCollisionDetection } from '../src/dnd/collision';

type CollisionArgs = Parameters<CollisionDetection>[0];
type DroppableContainer = CollisionArgs['droppableContainers'][number];

function rect(left: number, top: number, width: number, height: number) {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

function createDroppableContainer(
  id: string,
  data: DroppableContainer['data']['current'],
): DroppableContainer {
  return {
    id,
    key: id,
    data: { current: data },
    disabled: false,
    node: { current: null },
    rect: { current: null },
  };
}

function createCollisionArgs(
  collisionRect: CollisionArgs['collisionRect'],
  containers: DroppableContainer[],
  rects: CollisionArgs['droppableRects'],
): CollisionArgs {
  return {
    active: {
      id: 'active',
      data: { current: { type: 'existing-mit' } },
      rect: { current: { initial: null, translated: collisionRect } },
    },
    collisionRect,
    droppableRects: rects,
    droppableContainers: containers,
    pointerCoordinates: null,
  };
}

test('矩形相交面积只按真实重叠区域计算', () => {
  assert.equal(getRectIntersectionArea(rect(0, 0, 10, 10), rect(5, 5, 10, 10)), 25);
  assert.equal(getRectIntersectionArea(rect(0, 0, 10, 10), rect(10, 10, 10, 10)), 0);
});

test('巨大时间轴投放区在 rectIntersection 比例取整为 0 时仍可命中', () => {
  const laneId = 'mit-lane:mit-lane-container:default';
  const lane = createDroppableContainer(laneId, {
    kind: 'mit-lane',
    timelineId: 'mit-lane-container',
    laneId: 'default',
    msPerPx: 200,
  });
  const args = createCollisionArgs(
    rect(808, 431.5, 40, 40),
    [lane],
    new Map([[laneId, rect(576, 239.5, 2280, 14819.046875)]]),
  );

  const collisions = mitigationCollisionDetection(args);

  assert.deepEqual(
    collisions.map((collision) => ({
      id: collision.id,
      value: collision.data?.value,
    })),
    [{ id: laneId, value: 1600 }],
  );
});

test('fallback 不接管非时间轴投放区', () => {
  const trashId = 'trash';
  const trash = createDroppableContainer(trashId, { kind: 'trash' });
  const args = createCollisionArgs(
    rect(808, 431.5, 40, 40),
    [trash],
    new Map([[trashId, rect(576, 239.5, 2280, 14819.046875)]]),
  );

  assert.deepEqual(mitigationCollisionDetection(args), []);
});
