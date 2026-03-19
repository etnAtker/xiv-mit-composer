import test from 'node:test';
import assert from 'node:assert/strict';

import { ROLE_SKILL_IDS, SKILLS } from '../src/data/skills';
import type { Job, MitEvent } from '../src/model/types';
import { buildTimelineLayout } from '../src/components/Timeline/timelineLayout';
import { buildConstraintSegments } from '../src/components/Timeline/cooldownConstraintUtils';
import { tryBuildCooldowns } from '../src/utils/playerCast';

function createMitEvent(
  skillId: string,
  tStartMs: number,
  ownerJob: Job,
  ownerId = 1,
  durationMs = 10_000,
): MitEvent {
  return {
    eventType: 'mit',
    id: `${skillId}-${tStartMs}-${ownerId}`,
    skillId,
    tStartMs,
    durationMs,
    tEndMs: tStartMs + durationMs,
    ownerJob,
    ownerId,
  };
}

test('共享资源的兄弟技能列会绘制完整 cooldown 区间，本技能列只露出尾巴', () => {
  const layout = buildTimelineLayout({
    jobs: ['WAR'],
    skills: SKILLS,
    roleSkillIds: ROLE_SKILL_IDS,
  });
  const mitEvents = [createMitEvent('war-bloodwhetting', 10_000, 'WAR', 1, 8_000)];
  const cooldownEvents = tryBuildCooldowns(mitEvents) ?? [];

  const segments = buildConstraintSegments(cooldownEvents, mitEvents, layout);

  assert.deepEqual(
    segments
      .filter((segment) => segment.skillId === 'war-bloodwhetting' && segment.cdType === 'cooldown')
      .map((segment) => ({ startMs: segment.startMs, endMs: segment.endMs })),
    [{ startMs: 18_000, endMs: 35_000 }],
  );
  assert.deepEqual(
    segments
      .filter((segment) => segment.skillId === 'war-nascent-flash' && segment.cdType === 'cooldown')
      .map((segment) => ({ startMs: segment.startMs, endMs: segment.endMs })),
    [{ startMs: 10_000, endMs: 35_000 }],
  );
});

test('效果时长覆盖 cooldown 时不会再生成可见 cooldown 区段', () => {
  const layout = buildTimelineLayout({
    jobs: ['DRK'],
    skills: SKILLS,
    roleSkillIds: ROLE_SKILL_IDS,
  });
  const mitEvents = [createMitEvent('drk-oblation', 10_000, 'DRK', 1, 10_000)];
  const cooldownEvents = tryBuildCooldowns(mitEvents) ?? [];

  const segments = buildConstraintSegments(cooldownEvents, mitEvents, layout);

  assert.deepEqual(
    segments
      .filter((segment) => segment.skillId === 'drk-oblation' && segment.cdType === 'cooldown')
      .map((segment) => ({ startMs: segment.startMs, endMs: segment.endMs })),
    [],
  );
});
