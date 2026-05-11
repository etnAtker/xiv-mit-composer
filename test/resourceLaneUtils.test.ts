import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildResourceLaneSegments,
  getResourceLevelColor,
  getResourceValueAt,
  shouldShowResourceSegmentValueLabel,
} from '../src/components/Timeline/resourceLaneUtils';
import type { ResourceEvent } from '../src/model/types';
import type { TimelineResourceColumn } from '../src/components/Timeline/types';

const column: TimelineResourceColumn = {
  id: 'pld-grp-sheltron',
  columnId: 'pld-grp-sheltron:1',
  label: '忠义',
  ownerId: 1,
  ownerName: 'Paladin',
  job: 'PLD',
  maxValue: 2,
};

const resourceEvents: ResourceEvent[] = [
  {
    resourceGroupId: 'pld-grp-sheltron',
    ownerKey: 'id:1',
    ownerJob: 'PLD',
    value: 2,
    maxValue: 2,
    tStartMs: 0,
    tEndMs: 10_000,
  },
  {
    resourceGroupId: 'pld-grp-sheltron',
    ownerKey: 'id:1',
    ownerJob: 'PLD',
    value: 1,
    maxValue: 2,
    tStartMs: 10_000,
    tEndMs: 35_000,
  },
  {
    resourceGroupId: 'pld-grp-sheltron',
    ownerKey: 'id:1',
    ownerJob: 'PLD',
    value: 2,
    maxValue: 2,
    tStartMs: 35_000,
    tEndMs: 35_000,
  },
];

test('资源列会把最后一个状态延伸到时间轴末尾', () => {
  const segments = buildResourceLaneSegments(resourceEvents, column, 60_000);

  assert.deepEqual(segments, [
    { value: 2, maxValue: 2, tStartMs: 0, tEndMs: 10_000 },
    { value: 1, maxValue: 2, tStartMs: 10_000, tEndMs: 35_000 },
    { value: 2, maxValue: 2, tStartMs: 35_000, tEndMs: 60_000 },
  ]);
});

test('资源列能读取屏幕顶部时刻的当前档数', () => {
  const segments = buildResourceLaneSegments(resourceEvents, column, 60_000);

  assert.equal(getResourceValueAt(segments, 20_000)?.value, 1);
  assert.equal(getResourceValueAt(segments, 50_000)?.value, 2);
});

test('资源颜色使用固定满档红色', () => {
  assert.equal(getResourceLevelColor(0, 2), '#3f4652');
  assert.equal(getResourceLevelColor(1, 2), '#2563eb');
  assert.equal(getResourceLevelColor(2, 2), '#dc2626');
  assert.equal(getResourceLevelColor(4, 5), '#ca8a04');
  assert.equal(getResourceLevelColor(5, 5), '#dc2626');
});

test('资源变化点标签会避开初始状态和顶部当前值', () => {
  assert.equal(
    shouldShowResourceSegmentValueLabel({
      segmentStartMs: 0,
      visibleStartMs: 0,
      zoom: 10,
      minDistancePx: 18,
    }),
    false,
  );
  assert.equal(
    shouldShowResourceSegmentValueLabel({
      segmentStartMs: 10_000,
      visibleStartMs: 9_000,
      zoom: 10,
      minDistancePx: 18,
    }),
    false,
  );
  assert.equal(
    shouldShowResourceSegmentValueLabel({
      segmentStartMs: 10_000,
      visibleStartMs: 5_000,
      zoom: 10,
      minDistancePx: 18,
    }),
    true,
  );
});
