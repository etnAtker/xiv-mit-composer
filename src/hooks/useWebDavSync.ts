import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/shallow';
import {
  createLiveSyncArchive,
  createSyncArchive,
  createSyncContentSignature,
  createSyncMetadata,
  hashSyncArchive,
  parseSyncArchive,
  parseSyncMetadata,
  serializeSyncArchive,
  SYNC_DIRECTORY_NAME,
  SYNC_ARCHIVE_FILE_NAME,
  SYNC_METADATA_FILE_NAME,
} from '../domain/sync/syncArchive';
import {
  WebDavError,
  ensureWebDavDirectory,
  isWebDavConfigured,
  readWebDavText,
  testWebDavConnection,
  writeWebDavText,
} from '../lib/webdav/client';
import type { WebDavSettings, XmcSyncArchive } from '../model/sync';
import { useStore } from '../store';
import type { PushBanner } from './useTopBanner';

export interface SyncConfirmation {
  type: 'upload' | 'download';
  remoteHash: string | null;
  remoteUploadedAt: string | null;
}

export interface SyncStatus {
  tone: 'info' | 'success' | 'error';
  message: string;
}

interface UseWebDavSyncOptions {
  zoom: number;
  isProjectRestored: boolean;
  setZoom: (zoom: number) => void;
  push: PushBanner;
}

export function useWebDavSync({ zoom, isProjectRestored, setZoom, push }: UseWebDavSyncOptions) {
  const projectState = useStore(
    useShallow((state) => ({
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
      projectSlots: state.projectSlots,
      activeProjectSlotId: state.activeProjectSlotId,
    })),
  );
  const { webDavSettings, saveCurrentProjectSlot, replaceProjectSlots, setWebDavSettings } =
    useStore(
      useShallow((state) => ({
        webDavSettings: state.webDavSettings,
        saveCurrentProjectSlot: state.saveCurrentProjectSlot,
        replaceProjectSlots: state.replaceProjectSlots,
        setWebDavSettings: state.setWebDavSettings,
      })),
    );
  const [isOpen, setIsOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [confirmation, setConfirmation] = useState<SyncConfirmation | null>(null);
  const [connectionState, setConnectionState] = useState<'unknown' | 'valid' | 'invalid'>(
    'unknown',
  );
  const baselineSignatureRef = useRef<string | null>(null);
  const hasUnuploadedChangesRef = useRef(false);
  const startupCheckedRef = useRef(false);

  const liveArchive = useMemo(
    () => createLiveSyncArchive(projectState, zoom),
    [projectState, zoom],
  );
  const liveContentSignature = useMemo(
    () => createSyncContentSignature(liveArchive),
    [liveArchive],
  );

  useEffect(() => {
    if (!isProjectRestored) return;
    if (baselineSignatureRef.current === null) {
      baselineSignatureRef.current = liveContentSignature;
      return;
    }
    if (baselineSignatureRef.current !== liveContentSignature) {
      hasUnuploadedChangesRef.current = true;
    }
  }, [isProjectRestored, liveContentSignature]);

  const markSynchronized = useCallback((archive: XmcSyncArchive) => {
    baselineSignatureRef.current = createSyncContentSignature(archive);
    hasUnuploadedChangesRef.current = false;
  }, []);

  const getSavedLocalArchive = useCallback(() => {
    saveCurrentProjectSlot(zoom);
    const latest = useStore.getState();
    return createSyncArchive(latest.projectSlots, latest.activeProjectSlotId);
  }, [saveCurrentProjectSlot, zoom]);

  const reportError = useCallback(
    (error: unknown, notify: boolean) => {
      console.error(error);
      const message = error instanceof Error ? error.message : 'WebDAV 同步失败';
      if (error instanceof WebDavError) setConnectionState('invalid');
      setStatus({ tone: 'error', message });
      if (notify) push(message, { tone: 'error' });
    },
    [push],
  );

  const readRemoteMetadata = useCallback(async (settings: WebDavSettings) => {
    const text = await readWebDavText(settings, SYNC_METADATA_FILE_NAME);
    return text === null ? null : parseSyncMetadata(text);
  }, []);

  const readRemoteSnapshot = useCallback(
    async (settings: WebDavSettings) => {
      const metadata = await readRemoteMetadata(settings);
      if (!metadata) throw new Error('远程目录中没有同步存档');

      const archiveText = await readWebDavText(settings, SYNC_ARCHIVE_FILE_NAME);
      if (archiveText === null) throw new Error('远程同步存档文件不存在');
      const archive = parseSyncArchive(archiveText);
      const actualHash = await hashSyncArchive(archive);
      if (actualHash !== metadata.hash) {
        throw new Error('远程同步存档与校验文件不一致，已停止下载');
      }
      return { archive, metadata };
    },
    [readRemoteMetadata],
  );

  const handleSettingsChange = useCallback(
    (settings: WebDavSettings) => {
      setWebDavSettings(settings);
      setConnectionState('unknown');
      setConfirmation(null);
      setStatus(null);
    },
    [setWebDavSettings],
  );

  const handleTestConnection = useCallback(async () => {
    const settings = useStore.getState().webDavSettings;
    setIsBusy(true);
    setStatus({ tone: 'info', message: '正在测试 WebDAV 连接…' });
    try {
      await testWebDavConnection(settings);
      setConnectionState('valid');
      setStatus({ tone: 'success', message: '连接成功，服务器已接受当前认证信息。' });
      push('WebDAV 连接测试成功');
    } catch (error) {
      reportError(error, true);
    } finally {
      setIsBusy(false);
    }
  }, [push, reportError]);

  const requestUpload = useCallback(async () => {
    setIsOpen(true);
    setConfirmation(null);
    const settings = useStore.getState().webDavSettings;
    if (!isWebDavConfigured(settings)) {
      setStatus({ tone: 'error', message: '请先填写 WebDAV 地址。' });
      return;
    }

    setIsBusy(true);
    setStatus({ tone: 'info', message: '正在比较本地与远程存档…' });
    try {
      await testWebDavConnection(settings);
      setConnectionState('valid');
      const localArchive = getSavedLocalArchive();
      const [localHash, remoteMetadata] = await Promise.all([
        hashSyncArchive(localArchive),
        readRemoteMetadata(settings),
      ]);
      if (remoteMetadata?.hash === localHash) {
        markSynchronized(localArchive);
        setStatus({ tone: 'success', message: '本地与远程存档一致，无需上传。' });
        push('本地与远程存档一致，无需上传');
        return;
      }

      setConfirmation({
        type: 'upload',
        remoteHash: remoteMetadata?.hash ?? null,
        remoteUploadedAt: remoteMetadata?.uploadedAt ?? null,
      });
      setStatus(null);
    } catch (error) {
      reportError(error, true);
    } finally {
      setIsBusy(false);
    }
  }, [getSavedLocalArchive, markSynchronized, push, readRemoteMetadata, reportError]);

  const confirmUpload = useCallback(async () => {
    if (confirmation?.type !== 'upload') return;
    const settings = useStore.getState().webDavSettings;
    setIsBusy(true);
    setStatus({ tone: 'info', message: '正在上传全部槽位…' });
    try {
      await testWebDavConnection(settings);
      const localArchive = getSavedLocalArchive();
      const [localHash, latestMetadata] = await Promise.all([
        hashSyncArchive(localArchive),
        readRemoteMetadata(settings),
      ]);
      if (latestMetadata?.hash === localHash) {
        markSynchronized(localArchive);
        setConfirmation(null);
        setStatus({ tone: 'success', message: '本地与远程存档一致，无需上传。' });
        return;
      }
      if ((latestMetadata?.hash ?? null) !== confirmation.remoteHash) {
        setConfirmation({
          type: 'upload',
          remoteHash: latestMetadata?.hash ?? null,
          remoteUploadedAt: latestMetadata?.uploadedAt ?? null,
        });
        setStatus({ tone: 'error', message: '远程存档已发生变化，请核对时间后重新确认。' });
        return;
      }

      const metadata = createSyncMetadata(localHash);
      await ensureWebDavDirectory(settings, SYNC_DIRECTORY_NAME);
      await writeWebDavText(settings, SYNC_ARCHIVE_FILE_NAME, serializeSyncArchive(localArchive));
      await writeWebDavText(settings, SYNC_METADATA_FILE_NAME, JSON.stringify(metadata));
      setConnectionState('valid');
      markSynchronized(localArchive);
      setConfirmation(null);
      setStatus({
        tone: 'success',
        message: `上传成功：${new Date(metadata.uploadedAt).toLocaleString()}`,
      });
      push('全部槽位已上传到 WebDAV');
    } catch (error) {
      reportError(error, true);
    } finally {
      setIsBusy(false);
    }
  }, [confirmation, getSavedLocalArchive, markSynchronized, push, readRemoteMetadata, reportError]);

  const requestDownload = useCallback(async () => {
    setIsOpen(true);
    setConfirmation(null);
    const settings = useStore.getState().webDavSettings;
    if (!isWebDavConfigured(settings)) {
      setStatus({ tone: 'error', message: '请先填写 WebDAV 地址。' });
      return;
    }

    setIsBusy(true);
    setStatus({ tone: 'info', message: '正在校验远程存档…' });
    try {
      await testWebDavConnection(settings);
      setConnectionState('valid');
      const localArchive = getSavedLocalArchive();
      const [{ metadata }, localHash] = await Promise.all([
        readRemoteSnapshot(settings),
        hashSyncArchive(localArchive),
      ]);
      if (metadata.hash === localHash) {
        markSynchronized(localArchive);
        setStatus({ tone: 'success', message: '本地与远程存档一致，无需下载。' });
        push('本地与远程存档一致，无需下载');
        return;
      }

      setConfirmation({
        type: 'download',
        remoteHash: metadata.hash,
        remoteUploadedAt: metadata.uploadedAt,
      });
      setStatus(null);
    } catch (error) {
      reportError(error, true);
    } finally {
      setIsBusy(false);
    }
  }, [getSavedLocalArchive, markSynchronized, push, readRemoteSnapshot, reportError]);

  const confirmDownload = useCallback(async () => {
    if (confirmation?.type !== 'download') return;
    const settings = useStore.getState().webDavSettings;
    setIsBusy(true);
    setStatus({ tone: 'info', message: '正在下载并恢复全部槽位…' });
    try {
      await testWebDavConnection(settings);
      const { archive, metadata } = await readRemoteSnapshot(settings);
      if (metadata.hash !== confirmation.remoteHash) {
        setConfirmation({
          type: 'download',
          remoteHash: metadata.hash,
          remoteUploadedAt: metadata.uploadedAt,
        });
        setStatus({ tone: 'error', message: '远程存档已发生变化，请核对时间后重新确认。' });
        return;
      }

      const document = replaceProjectSlots(archive.projectSlots, archive.activeProjectSlotId);
      setZoom(document.ui.zoom);
      setConnectionState('valid');
      markSynchronized(archive);
      setConfirmation(null);
      setStatus({ tone: 'success', message: '下载完成，全部本地槽位已被远程存档替换。' });
      push('已从 WebDAV 下载并恢复全部槽位');
    } catch (error) {
      reportError(error, true);
    } finally {
      setIsBusy(false);
    }
  }, [
    confirmation,
    markSynchronized,
    push,
    readRemoteSnapshot,
    reportError,
    setZoom,
    replaceProjectSlots,
  ]);

  useEffect(() => {
    if (!isProjectRestored || startupCheckedRef.current) return;
    startupCheckedRef.current = true;
    const settings = useStore.getState().webDavSettings;
    if (!isWebDavConfigured(settings)) return;

    void (async () => {
      try {
        await testWebDavConnection(settings);
        setConnectionState('valid');
        const metadata = await readRemoteMetadata(settings);
        if (!metadata) return;
        const localArchive = getSavedLocalArchive();
        const localHash = await hashSyncArchive(localArchive);
        if (localHash === metadata.hash) {
          markSynchronized(localArchive);
          return;
        }
        setConfirmation({
          type: 'download',
          remoteHash: metadata.hash,
          remoteUploadedAt: metadata.uploadedAt,
        });
        setStatus(null);
        setIsOpen(true);
      } catch (error) {
        // 自动检查失败时按配置无效处理，不打断页面加载。
        reportError(error, false);
      }
    })();
  }, [getSavedLocalArchive, isProjectRestored, markSynchronized, readRemoteMetadata, reportError]);

  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void requestUpload();
      }
    };
    window.addEventListener('keydown', handleSaveShortcut);
    return () => window.removeEventListener('keydown', handleSaveShortcut);
  }, [requestUpload]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const contentChangedSinceSynchronization =
        baselineSignatureRef.current !== null &&
        baselineSignatureRef.current !== liveContentSignature;
      if (
        (!hasUnuploadedChangesRef.current && !contentChangedSinceSynchronization) ||
        connectionState !== 'valid' ||
        !isWebDavConfigured(webDavSettings)
      ) {
        return;
      }
      event.preventDefault();
      event.returnValue = true;
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [connectionState, liveContentSignature, webDavSettings]);

  return {
    isOpen,
    isBusy,
    status,
    confirmation,
    settings: webDavSettings,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    handleSettingsChange,
    handleTestConnection,
    requestUpload,
    requestDownload,
    confirmUpload,
    confirmDownload,
    cancelConfirmation: () => setConfirmation(null),
  };
}
