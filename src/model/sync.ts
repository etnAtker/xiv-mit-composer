import type { ProjectSlot } from './project';

export const XMC_SYNC_APP = 'xiv-mit-composer-sync';
export const XMC_SYNC_VERSION = 1;
export const XMC_SYNC_METADATA_VERSION = 2;

export interface WebDavSettings {
  url: string;
  username: string;
  password: string;
}

export interface XmcSyncArchive {
  app: typeof XMC_SYNC_APP;
  version: typeof XMC_SYNC_VERSION;
  activeProjectSlotId: string;
  projectSlots: ProjectSlot[];
}

export interface XmcSyncMetadata {
  version: typeof XMC_SYNC_METADATA_VERSION;
  algorithm: 'SHA-256';
  hash: string;
  uploadedAt: string;
  archiveEncoding: 'gzip';
}
