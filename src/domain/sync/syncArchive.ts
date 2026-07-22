import {
  createProjectDocumentContentSnapshot,
  createProjectDocumentFromState,
  normalizeProjectDocument,
} from '../project/projectDocument';
import type { ProjectSlot } from '../../model/project';
import type { AppState } from '../../store';
import {
  XMC_SYNC_APP,
  XMC_SYNC_METADATA_VERSION,
  XMC_SYNC_VERSION,
  type XmcSyncArchive,
  type XmcSyncMetadata,
} from '../../model/sync';

export const SYNC_DIRECTORY_NAME = 'xiv-mit-composer';
export const SYNC_ARCHIVE_FILE_NAME = `${SYNC_DIRECTORY_NAME}/xiv-mit-composer.sync.json`;
export const SYNC_METADATA_FILE_NAME = `${SYNC_DIRECTORY_NAME}/xiv-mit-composer.sync-meta.json`;

export class SyncArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncArchiveError';
  }
}

export function createSyncArchive(
  projectSlots: ProjectSlot[],
  activeProjectSlotId: string | null,
): XmcSyncArchive {
  if (!projectSlots.length) {
    throw new SyncArchiveError('没有可同步的工程槽位');
  }

  const activeId = projectSlots.some((slot) => slot.id === activeProjectSlotId)
    ? activeProjectSlotId
    : projectSlots[0]?.id;
  if (!activeId) {
    throw new SyncArchiveError('当前工程槽位无效');
  }

  return {
    app: XMC_SYNC_APP,
    version: XMC_SYNC_VERSION,
    activeProjectSlotId: activeId,
    projectSlots,
  };
}

type LiveSyncState = Pick<
  AppState,
  | 'fflogsUrl'
  | 'fight'
  | 'actors'
  | 'bossIds'
  | 'selectedJob'
  | 'selectedPlayerId'
  | 'partyMembers'
  | 'damageEventMembers'
  | 'damageEventsByPlayerId'
  | 'castEvents'
  | 'mitEvents'
  | 'projectSlots'
  | 'activeProjectSlotId'
>;

export function createLiveSyncArchive(state: LiveSyncState, zoom: number): XmcSyncArchive {
  const activeSlot =
    state.projectSlots.find((slot) => slot.id === state.activeProjectSlotId) ??
    state.projectSlots[0];
  if (!activeSlot) return createSyncArchive(state.projectSlots, state.activeProjectSlotId);

  const liveDocument = createProjectDocumentFromState(
    state,
    zoom,
    activeSlot.document,
    activeSlot.name,
  );
  const projectSlots = state.projectSlots.map((slot) =>
    slot.id === activeSlot.id
      ? {
          ...slot,
          document: liveDocument,
        }
      : slot,
  );
  return createSyncArchive(projectSlots, state.activeProjectSlotId);
}

export function normalizeSyncArchive(input: unknown): XmcSyncArchive {
  if (!isRecord(input)) {
    throw new SyncArchiveError('远程同步存档不是有效对象');
  }
  if (input.app !== XMC_SYNC_APP || input.version !== XMC_SYNC_VERSION) {
    throw new SyncArchiveError('远程同步存档版本不受支持');
  }
  if (!Array.isArray(input.projectSlots) || input.projectSlots.length === 0) {
    throw new SyncArchiveError('远程同步存档没有工程槽位');
  }

  const ids = new Set<string>();
  const projectSlots = input.projectSlots.map((value, index) => {
    if (!isRecord(value) || typeof value.id !== 'string' || !value.id.trim()) {
      throw new SyncArchiveError(`远程同步存档的第 ${index + 1} 个槽位 ID 无效`);
    }
    if (ids.has(value.id)) {
      throw new SyncArchiveError(`远程同步存档包含重复槽位 ID：${value.id}`);
    }
    ids.add(value.id);

    const document = normalizeProjectDocument(value.document);
    return {
      id: value.id,
      name: typeof value.name === 'string' && value.name.trim() ? value.name : document.name,
      updatedAt:
        typeof value.updatedAt === 'string' && value.updatedAt
          ? value.updatedAt
          : document.updatedAt,
      document,
    };
  });

  const requestedActiveId =
    typeof input.activeProjectSlotId === 'string' ? input.activeProjectSlotId : '';
  const activeProjectSlotId = ids.has(requestedActiveId) ? requestedActiveId : projectSlots[0]!.id;

  return createSyncArchive(projectSlots, activeProjectSlotId);
}

export function serializeSyncArchive(archive: XmcSyncArchive): string {
  return JSON.stringify(normalizeSyncArchive(archive));
}

export function parseSyncArchive(text: string): XmcSyncArchive {
  try {
    return normalizeSyncArchive(JSON.parse(text));
  } catch (error) {
    if (error instanceof SyncArchiveError) throw error;
    throw new SyncArchiveError('远程同步存档解析失败');
  }
}

export function createSyncContentSignature(archive: XmcSyncArchive): string {
  const normalized = normalizeSyncArchive(archive);
  return JSON.stringify({
    activeProjectSlotId: normalized.activeProjectSlotId,
    projectSlots: normalized.projectSlots.map((slot) => ({
      id: slot.id,
      name: slot.name,
      document: createProjectDocumentContentSnapshot(slot.document),
    })),
  });
}

export async function hashSyncArchive(archive: XmcSyncArchive): Promise<string> {
  const bytes = new TextEncoder().encode(serializeSyncArchive(archive));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createSyncMetadata(
  hash: string,
  uploadedAt = new Date().toISOString(),
): XmcSyncMetadata {
  return {
    version: XMC_SYNC_METADATA_VERSION,
    algorithm: 'SHA-256',
    hash,
    uploadedAt,
  };
}

export function parseSyncMetadata(text: string): XmcSyncMetadata {
  try {
    const input: unknown = JSON.parse(text);
    if (
      !isRecord(input) ||
      input.version !== XMC_SYNC_METADATA_VERSION ||
      input.algorithm !== 'SHA-256' ||
      typeof input.hash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(input.hash) ||
      typeof input.uploadedAt !== 'string' ||
      Number.isNaN(Date.parse(input.uploadedAt))
    ) {
      throw new SyncArchiveError('远程同步校验文件格式无效');
    }
    return input as unknown as XmcSyncMetadata;
  } catch (error) {
    if (error instanceof SyncArchiveError) throw error;
    throw new SyncArchiveError('远程同步校验文件解析失败');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
