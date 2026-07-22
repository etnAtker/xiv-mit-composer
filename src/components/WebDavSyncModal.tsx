import { useState } from 'react';
import type { SyncConfirmation, SyncStatus } from '../hooks/useWebDavSync';
import type { WebDavSettings } from '../model/sync';
import { cn } from '../utils';

interface Props {
  isOpen: boolean;
  isBusy: boolean;
  settings: WebDavSettings;
  status: SyncStatus | null;
  confirmation: SyncConfirmation | null;
  onClose: () => void;
  onSettingsChange: (settings: WebDavSettings) => void;
  onTestConnection: () => Promise<void>;
  onUpload: () => Promise<void>;
  onDownload: () => Promise<void>;
  onConfirmUpload: () => Promise<void>;
  onConfirmDownload: () => Promise<void>;
  onCancelConfirmation: () => void;
}

export function WebDavSyncModal({
  isOpen,
  isBusy,
  settings,
  status,
  confirmation,
  onClose,
  onSettingsChange,
  onTestConnection,
  onUpload,
  onDownload,
  onConfirmUpload,
  onConfirmDownload,
  onCancelConfirmation,
}: Props) {
  const [showPassword, setShowPassword] = useState(false);
  const [draftSettings, setDraftSettings] = useState(settings);

  if (!isOpen) return null;

  const updateSetting = (key: keyof WebDavSettings, value: string) => {
    setDraftSettings((current) => ({ ...current, [key]: value }));
  };

  const saveSettings = () => {
    if (
      draftSettings.url === settings.url &&
      draftSettings.username === settings.username &&
      draftSettings.password === settings.password
    ) {
      return;
    }
    onSettingsChange(draftSettings);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-app bg-surface-2 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="webdav-modal-title"
      >
        <div className="flex items-center justify-between border-b border-app bg-surface-3 p-4">
          <div>
            <h3 className="text-lg font-bold text-app" id="webdav-modal-title">
              WebDAV 同步
            </h3>
            <div className="mt-1 text-xs text-muted">同步全部工程槽位，不上传任何认证信息。</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-lg text-muted transition-colors hover:bg-surface-4 hover:text-app disabled:opacity-50"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted">WebDAV 目录地址</span>
              <input
                type="url"
                value={draftSettings.url}
                onChange={(event) => updateSetting('url', event.target.value)}
                onBlur={saveSettings}
                placeholder="https://example.com/dav/xiv-mit-composer/"
                className="h-10 w-full rounded border border-app bg-surface px-3 text-sm text-app outline-none focus:ring-1 focus:ring-(--color-focus)"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted">用户名</span>
                <input
                  value={draftSettings.username}
                  onChange={(event) => updateSetting('username', event.target.value)}
                  onBlur={saveSettings}
                  autoComplete="username"
                  className="h-10 w-full rounded border border-app bg-surface px-3 text-sm text-app outline-none focus:ring-1 focus:ring-(--color-focus)"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted">密码</span>
                <div className="flex">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={draftSettings.password}
                    onChange={(event) => updateSetting('password', event.target.value)}
                    onBlur={saveSettings}
                    autoComplete="current-password"
                    className="h-10 min-w-0 flex-1 rounded-l border border-app bg-surface px-3 text-sm text-app outline-none focus:ring-1 focus:ring-(--color-focus)"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="rounded-r border border-l-0 border-app bg-surface-3 px-3 text-xs text-muted hover:text-app"
                  >
                    {showPassword ? '隐藏' : '显示'}
                  </button>
                </div>
              </label>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="text-xs text-muted">
                服务器需允许浏览器跨域访问以及 PROPFIND、MKCOL、GET、PUT 和 Authorization 请求头。
              </div>
              <button
                type="button"
                disabled={isBusy || !draftSettings.url.trim()}
                onClick={onTestConnection}
                className="shrink-0 rounded border border-app bg-surface-3 px-4 py-2 text-xs font-semibold text-app transition-colors hover:border-(--color-accent) disabled:opacity-50"
              >
                测试连接
              </button>
            </div>
          </div>

          {status && (
            <div
              className={cn(
                'rounded-lg border px-4 py-3 text-sm',
                status.tone === 'error' && 'border-(--color-danger) text-danger',
                status.tone === 'success' && 'border-(--color-primary-action) text-app',
                status.tone === 'info' && 'border-app text-muted',
              )}
            >
              {status.message}
            </div>
          )}

          {confirmation && (
            <div className="rounded-lg border border-(--color-danger) bg-surface p-4">
              <div className="font-semibold text-app">
                {confirmation.type === 'upload'
                  ? '上传将覆盖远程全部槽位'
                  : '下载将覆盖本地全部槽位'}
              </div>
              <div className="mt-2 text-sm text-muted">
                远程存档上传时间：{formatRemoteTime(confirmation.remoteUploadedAt)}
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={onCancelConfirmation}
                  className="rounded border border-app px-4 py-2 text-xs font-semibold text-app disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={confirmation.type === 'upload' ? onConfirmUpload : onConfirmDownload}
                  className="rounded bg-accent-strong px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  确认{confirmation.type === 'upload' ? '上传' : '下载'}
                </button>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-app pt-4">
            <button
              type="button"
              disabled={isBusy || !draftSettings.url.trim()}
              onClick={onDownload}
              className="rounded border border-app bg-surface-3 px-5 py-2.5 text-sm font-semibold text-app transition-colors hover:border-(--color-accent) disabled:opacity-50"
            >
              下载全部槽位
            </button>
            <button
              type="button"
              disabled={isBusy || !draftSettings.url.trim()}
              onClick={onUpload}
              className="rounded bg-primary-action px-5 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50"
            >
              上传全部槽位
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatRemoteTime(value: string | null): string {
  if (!value) return '远程尚无同步记录';
  return new Date(value).toLocaleString();
}
