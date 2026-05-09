import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_ZOOM } from '../src/constants/timeline';
import { encodeProjectDocument, decodeProjectDocument } from '../src/domain/project/projectCodec';
import {
  createProjectDocumentFromState,
  normalizeProjectDocument,
} from '../src/domain/project/projectDocument';
import { XMC_PROJECT_PREFIX } from '../src/model/project';
import type { AppState } from '../src/store';

const baseState = {
  fflogsUrl: 'https://www.fflogs.com/reports/abc123?fight=4',
  fight: {
    id: 4,
    start: 1000,
    end: 121000,
    durationMs: 120000,
    name: '测试战斗',
    zoneID: 1,
    fflogsBoss: 2,
  },
  actors: [{ id: 1, name: 'Player', type: 'GNB', subType: 'GNB' }],
  bossIds: [99],
  selectedJob: 'GNB',
  selectedPlayerId: 1,
  partyMembers: [{ playerId: 1, name: 'Player', job: 'GNB', collapsed: false, source: 'player' }],
  damageEventMembers: [
    { playerId: 1, name: 'Player', job: 'GNB', collapsed: false, source: 'player' },
  ],
  damageEvents: [
    {
      timestamp: 2000,
      type: 'damage-taken',
      sourceID: 99,
      targetID: 1,
      ability: { name: 'Raidwide', guid: 10, type: 1 },
      amount: 1000,
      unmitigatedAmount: 1200,
      tMs: 1000,
    },
  ],
  damageEventsByJob: {},
  damageEventsByPlayerId: {
    1: [
      {
        timestamp: 2000,
        type: 'damage-taken',
        sourceID: 99,
        targetID: 1,
        ability: { name: 'Raidwide', guid: 10, type: 1 },
        amount: 1000,
        unmitigatedAmount: 1200,
        tMs: 1000,
      },
    ],
  },
  castEvents: [
    {
      timestamp: 5000,
      type: 'begincast',
      sourceID: 99,
      targetID: 1,
      ability: { name: 'Cast', guid: 20, type: 1 },
      tMs: 4000,
    },
  ],
  mitEvents: [
    {
      eventType: 'mit',
      id: 'mit-1',
      skillId: 'role-rampart@GNB',
      tStartMs: 10_000,
      durationMs: 20_000,
      tEndMs: 30_000,
      ownerId: 1,
      ownerJob: 'GNB',
    },
  ],
} satisfies Pick<
  AppState,
  | 'fflogsUrl'
  | 'fight'
  | 'actors'
  | 'bossIds'
  | 'selectedJob'
  | 'selectedPlayerId'
  | 'partyMembers'
  | 'damageEventMembers'
  | 'damageEvents'
  | 'damageEventsByJob'
  | 'damageEventsByPlayerId'
  | 'castEvents'
  | 'mitEvents'
>;

test('工程文档编解码会保留完整 FFLogs 事件和减伤事件', async () => {
  const document = createProjectDocumentFromState(baseState, DEFAULT_ZOOM, undefined, 'P1 槽位');
  const encoded = await encodeProjectDocument(document);
  const decoded = normalizeProjectDocument(await decodeProjectDocument(encoded));

  assert.ok(encoded.startsWith(XMC_PROJECT_PREFIX));
  assert.equal(decoded.name, 'P1 槽位');
  assert.deepEqual(decoded.state.castEvents, document.state.castEvents);
  assert.deepEqual(decoded.state.damageEventsByPlayerId, document.state.damageEventsByPlayerId);
  assert.deepEqual(decoded.state.mitEvents, document.state.mitEvents);
  assert.equal(decoded.source.reportCode, 'abc123');
  assert.equal(decoded.source.fightId, '4');
});

test('工程文档规范化会拒绝不受支持的版本', () => {
  assert.throws(
    () => normalizeProjectDocument({ app: 'xiv-mit-composer', version: 999, state: {} }),
    /工程版本不受支持/,
  );
});
