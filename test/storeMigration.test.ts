import test from 'node:test';
import assert from 'node:assert/strict';

import { migratePersistedState } from '../src/store';
import type { Job, MitEvent, PartyMember } from '../src/model/types';

function createMitEvent(
  skillId: string,
  tStartMs: number,
  ownerJob?: Job,
  ownerId?: number,
): MitEvent {
  return {
    eventType: 'mit',
    id: `${skillId}-${tStartMs}`,
    skillId,
    tStartMs,
    durationMs: 10_000,
    tEndMs: tStartMs + 10_000,
    ownerJob,
    ownerId,
  };
}

test('旧持久化状态迁移会为冷却冲突数据保留容错 cooldownEvents', () => {
  const selectedJob: Job = 'PLD';
  const partyMembers: PartyMember[] = [
    { playerId: 1, name: 'Player', job: selectedJob, collapsed: false, source: 'player' },
  ];
  const legacyState = {
    selectedJob,
    selectedPlayerId: 1,
    partyMembers,
    mitEvents: [createMitEvent('role-rampart', 10_000), createMitEvent('role-rampart', 20_000)],
  };

  const migrated = migratePersistedState(legacyState);

  assert.equal(migrated.mitEvents[0]?.ownerId, 1);
  assert.equal(migrated.mitEvents[0]?.ownerJob, selectedJob);
  assert.ok(migrated.cooldownEvents.length > 0);
});
