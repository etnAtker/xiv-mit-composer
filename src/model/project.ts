import type {
  Actor,
  CastEvent,
  DamageEventsByPlayerId,
  Fight,
  Job,
  MitEvent,
  PartyMember,
} from './types';

export const XMC_PROJECT_APP = 'xiv-mit-composer';
export const XMC_PROJECT_VERSION = 1;
export const XMC_PROJECT_PREFIX = 'XMC1:';

export interface XmcProjectSource {
  fflogsUrl: string;
  reportCode: string | null;
  fightId: string | null;
}

export interface XmcProjectState {
  fflogsUrl: string;
  fight: Fight | null;
  actors: Actor[];
  bossIds: number[];
  selectedJob: Job | null;
  selectedPlayerId: number | null;
  partyMembers: PartyMember[];
  damageEventMembers: PartyMember[];
  damageEventsByPlayerId: DamageEventsByPlayerId;
  castEvents: CastEvent[];
  mitEvents: MitEvent[];
}

export interface XmcProjectUi {
  zoom: number;
}

export interface XmcProjectDocument {
  version: typeof XMC_PROJECT_VERSION;
  app: typeof XMC_PROJECT_APP;
  name: string;
  createdAt: string;
  updatedAt: string;
  source: XmcProjectSource;
  state: XmcProjectState;
  ui: XmcProjectUi;
}

export interface ProjectSlot {
  id: string;
  name: string;
  updatedAt: string;
  document: XmcProjectDocument;
}
