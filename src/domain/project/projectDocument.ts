import { DEFAULT_ZOOM, MAX_ZOOM, MIN_ZOOM } from '../../constants/timeline';
import {
  XMC_PROJECT_APP,
  XMC_PROJECT_VERSION,
  type ProjectSlot,
  type XmcProjectDocument,
  type XmcProjectState,
} from '../../model/project';
import type { AppState } from '../../store';
import { parseFFLogsUrl } from '../../utils';

export const DEFAULT_PROJECT_SLOT_NAME = '默认槽位';

export class ProjectDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectDocumentError';
  }
}

export function createProjectDocumentContentSnapshot(document: XmcProjectDocument) {
  return {
    version: document.version,
    app: document.app,
    name: document.name,
    createdAt: document.createdAt,
    source: document.source,
    state: document.state,
    ui: document.ui,
  };
}

export function areProjectDocumentsContentEqual(
  left: XmcProjectDocument,
  right: XmcProjectDocument,
): boolean {
  return (
    JSON.stringify(createProjectDocumentContentSnapshot(left)) ===
    JSON.stringify(createProjectDocumentContentSnapshot(right))
  );
}

export function createProjectDocumentFromState(
  state: Pick<
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
  >,
  zoom: number,
  previous?: XmcProjectDocument,
  name?: string,
  now = new Date().toISOString(),
): XmcProjectDocument {
  const parsed = parseFFLogsUrl(state.fflogsUrl);
  const documentName =
    name?.trim() || previous?.name || state.fight?.name || DEFAULT_PROJECT_SLOT_NAME;

  return {
    version: XMC_PROJECT_VERSION,
    app: XMC_PROJECT_APP,
    name: documentName,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    source: {
      fflogsUrl: state.fflogsUrl,
      reportCode: parsed?.reportCode ?? previous?.source.reportCode ?? null,
      fightId: parsed?.fightId ?? previous?.source.fightId ?? null,
    },
    state: {
      fflogsUrl: state.fflogsUrl,
      fight: state.fight,
      actors: state.actors,
      bossIds: state.bossIds,
      selectedJob: state.selectedJob,
      selectedPlayerId: state.selectedPlayerId,
      partyMembers: state.partyMembers,
      damageEventMembers: state.damageEventMembers,
      damageEventsByPlayerId: state.damageEventsByPlayerId,
      castEvents: state.castEvents,
      mitEvents: state.mitEvents,
    },
    ui: {
      zoom: clampZoom(zoom),
    },
  };
}

export function normalizeProjectDocument(input: unknown): XmcProjectDocument {
  if (!isRecord(input)) {
    throw new ProjectDocumentError('工程内容不是有效对象');
  }

  if (input.app !== XMC_PROJECT_APP || input.version !== XMC_PROJECT_VERSION) {
    throw new ProjectDocumentError('工程版本不受支持');
  }

  if (!isRecord(input.state)) {
    throw new ProjectDocumentError('工程状态缺失');
  }

  const state = input.state;
  const source = isRecord(input.source) ? input.source : {};
  const ui = isRecord(input.ui) ? input.ui : {};

  return {
    version: XMC_PROJECT_VERSION,
    app: XMC_PROJECT_APP,
    name: asString(input.name) || DEFAULT_PROJECT_SLOT_NAME,
    createdAt: asString(input.createdAt) || new Date().toISOString(),
    updatedAt: asString(input.updatedAt) || new Date().toISOString(),
    source: {
      fflogsUrl: asString(source.fflogsUrl),
      reportCode: asNullableString(source.reportCode),
      fightId: asNullableString(source.fightId),
    },
    state: normalizeProjectState(state),
    ui: {
      zoom: clampZoom(asNumber(ui.zoom) ?? DEFAULT_ZOOM),
    },
  };
}

export function createDefaultProjectSlot(now = new Date().toISOString()): ProjectSlot {
  const document = createEmptyProjectDocument(now);
  return {
    id: createProjectSlotId(),
    name: DEFAULT_PROJECT_SLOT_NAME,
    updatedAt: now,
    document,
  };
}

export function createProjectSlotId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `slot-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createEmptyProjectDocument(now: string): XmcProjectDocument {
  return {
    version: XMC_PROJECT_VERSION,
    app: XMC_PROJECT_APP,
    name: DEFAULT_PROJECT_SLOT_NAME,
    createdAt: now,
    updatedAt: now,
    source: {
      fflogsUrl: '',
      reportCode: null,
      fightId: null,
    },
    state: {
      fflogsUrl: '',
      fight: null,
      actors: [],
      bossIds: [],
      selectedJob: 'GNB',
      selectedPlayerId: null,
      partyMembers: [],
      damageEventMembers: [],
      damageEventsByPlayerId: {},
      castEvents: [],
      mitEvents: [],
    },
    ui: {
      zoom: DEFAULT_ZOOM,
    },
  };
}

function normalizeProjectState(state: Record<string, unknown>): XmcProjectState {
  return {
    fflogsUrl: asString(state.fflogsUrl),
    fight: isRecord(state.fight) ? (state.fight as unknown as XmcProjectState['fight']) : null,
    actors: asArray(state.actors) as XmcProjectState['actors'],
    bossIds: asArray(state.bossIds).filter((id): id is number => typeof id === 'number'),
    selectedJob: (asString(state.selectedJob) || null) as XmcProjectState['selectedJob'],
    selectedPlayerId: asNullableNumber(state.selectedPlayerId),
    partyMembers: asArray(state.partyMembers) as XmcProjectState['partyMembers'],
    damageEventMembers: asArray(state.damageEventMembers) as XmcProjectState['damageEventMembers'],
    damageEventsByPlayerId: isRecord(state.damageEventsByPlayerId)
      ? (state.damageEventsByPlayerId as XmcProjectState['damageEventsByPlayerId'])
      : {},
    castEvents: asArray(state.castEvents) as XmcProjectState['castEvents'],
    mitEvents: asArray(state.mitEvents) as XmcProjectState['mitEvents'],
  };
}

function clampZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
