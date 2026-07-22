import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compressSyncArchive,
  createSyncArchive,
  createSyncContentSignature,
  createSyncMetadata,
  decompressSyncArchive,
  hashSyncArchive,
  normalizeSyncArchive,
  parseSyncArchive,
  parseSyncMetadata,
  serializeSyncArchive,
  SYNC_ARCHIVE_FILE_NAME,
  SYNC_METADATA_FILE_NAME,
} from '../src/domain/sync/syncArchive';
import {
  areProjectDocumentsContentEqual,
  createDefaultProjectSlot,
} from '../src/domain/project/projectDocument';

test('同步文件位于固定的 xiv-mit-composer 子目录', () => {
  assert.equal(SYNC_ARCHIVE_FILE_NAME, 'xiv-mit-composer/xiv-mit-composer.sync.json.gz');
  assert.equal(SYNC_METADATA_FILE_NAME, 'xiv-mit-composer/xiv-mit-composer.sync-meta.json');
});

test('槽位有效内容比较忽略 updatedAt，但识别真实内容变化', () => {
  const slot = createDefaultProjectSlot('2026-01-01T00:00:00.000Z');
  const timestampOnlyChange = {
    ...slot.document,
    updatedAt: '2026-01-02T00:00:00.000Z',
  };
  const contentChange = {
    ...timestampOnlyChange,
    name: '已编辑槽位',
  };

  assert.equal(areProjectDocumentsContentEqual(slot.document, timestampOnlyChange), true);
  assert.equal(areProjectDocumentsContentEqual(slot.document, contentChange), false);
});

test('同步内容签名复用槽位有效内容快照并忽略保存时间', () => {
  const slot = createDefaultProjectSlot('2026-01-01T00:00:00.000Z');
  const original = createSyncArchive([slot], slot.id);
  const timestampOnlyChange = createSyncArchive(
    [
      {
        ...slot,
        updatedAt: '2026-01-02T00:00:00.000Z',
        document: {
          ...slot.document,
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      },
    ],
    slot.id,
  );

  assert.equal(
    createSyncContentSignature(original),
    createSyncContentSignature(timestampOnlyChange),
  );
});

test('上传时间位于独立元数据中且不会改变同步存档 Hash', async () => {
  const slot = createDefaultProjectSlot('2026-01-01T00:00:00.000Z');
  const archive = createSyncArchive([slot], slot.id);
  const hash = await hashSyncArchive(archive);
  const firstMetadata = createSyncMetadata(hash, '2026-01-02T00:00:00.000Z');
  const secondMetadata = createSyncMetadata(hash, '2026-01-03T00:00:00.000Z');

  assert.equal(firstMetadata.hash, secondMetadata.hash);
  assert.notEqual(firstMetadata.uploadedAt, secondMetadata.uploadedAt);
  assert.equal(firstMetadata.archiveEncoding, 'gzip');
  assert.equal(await hashSyncArchive(archive), hash);
});

test('同步存档使用 gzip 压缩并能完整恢复', async () => {
  const slot = createDefaultProjectSlot('2026-01-01T00:00:00.000Z');
  const archive = createSyncArchive([slot], slot.id);
  const compressed = await compressSyncArchive(archive);
  const restored = await decompressSyncArchive(compressed);

  assert.deepEqual(Array.from(compressed.subarray(0, 2)), [0x1f, 0x8b]);
  assert.deepEqual(restored, archive);
});

test('同步校验文件拒绝旧版未压缩格式', () => {
  assert.throws(
    () =>
      parseSyncMetadata(
        JSON.stringify({
          version: 1,
          algorithm: 'SHA-256',
          hash: '0'.repeat(64),
          uploadedAt: '2026-01-01T00:00:00.000Z',
        }),
      ),
    /格式无效/,
  );
});

test('同步存档序列化会保留全部槽位和当前槽位', () => {
  const first = createDefaultProjectSlot('2026-01-01T00:00:00.000Z');
  const second = {
    ...createDefaultProjectSlot('2026-01-02T00:00:00.000Z'),
    name: '第二槽位',
  };
  const archive = createSyncArchive([first, second], second.id);
  const parsed = parseSyncArchive(serializeSyncArchive(archive));

  assert.equal(parsed.projectSlots.length, 2);
  assert.equal(parsed.activeProjectSlotId, second.id);
});

test('同步存档拒绝重复槽位 ID', () => {
  const slot = createDefaultProjectSlot('2026-01-01T00:00:00.000Z');

  assert.throws(
    () =>
      normalizeSyncArchive({
        app: 'xiv-mit-composer-sync',
        version: 1,
        activeProjectSlotId: slot.id,
        projectSlots: [slot, { ...slot }],
      }),
    /重复槽位 ID/,
  );
});
