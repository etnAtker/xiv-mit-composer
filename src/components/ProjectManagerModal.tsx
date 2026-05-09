import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { ProjectSlot } from '../model/project';
import { cn } from '../utils';

interface Props {
  isOpen: boolean;
  isBusy: boolean;
  slots: ProjectSlot[];
  activeSlotId: string | null;
  exportContent: string;
  onClose: () => void;
  onGenerateExport: () => Promise<void>;
  onImport: (content: string) => Promise<void>;
  onSwitchSlot: (id: string) => void;
  onCreateSlot: (name: string) => void;
  onDuplicateSlot: (name: string) => void;
  onRenameSlot: (id: string, name: string) => void;
  onDeleteSlot: (id: string) => void;
}

export function ProjectManagerModal({
  isOpen,
  isBusy,
  slots,
  activeSlotId,
  exportContent,
  onClose,
  onGenerateExport,
  onImport,
  onSwitchSlot,
  onCreateSlot,
  onDuplicateSlot,
  onRenameSlot,
  onDeleteSlot,
}: Props) {
  const [importContent, setImportContent] = useState('');
  const [slotName, setSlotName] = useState('');
  const [renamingSlotId, setRenamingSlotId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeSlot = useMemo(
    () => slots.find((slot) => slot.id === activeSlotId) ?? null,
    [activeSlotId, slots],
  );

  if (!isOpen) return null;

  const handleCopy = async () => {
    if (!exportContent) return;
    await navigator.clipboard.writeText(exportContent);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const handleDownload = () => {
    if (!exportContent) return;

    const blob = new Blob([exportContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${sanitizeFileName(activeSlot?.name ?? 'xiv-mit-composer')}.xmc`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const content = await file.text();
    setImportContent(content);
    await onImport(content);
  };

  const commitRename = (slotId: string) => {
    onRenameSlot(slotId, renameValue);
    setRenamingSlotId(null);
    setRenameValue('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div
        className="flex h-[82vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-app bg-surface-2 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-modal-title"
      >
        <div className="flex items-center justify-between border-b border-app bg-surface-3 p-4">
          <div>
            <h3 className="text-lg font-bold text-app" id="project-modal-title">
              导入/导出
            </h3>
            <div className="mt-1 text-xs text-muted">当前槽位：{activeSlot?.name ?? '未选择'}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-lg text-muted transition-colors hover:bg-surface-4 hover:text-app"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[320px_1fr] overflow-hidden">
          <div className="flex min-h-0 flex-col border-r border-app bg-surface p-4">
            <div className="mb-3 flex gap-2">
              <input
                value={slotName}
                onChange={(e) => setSlotName(e.target.value)}
                className="h-9 min-w-0 flex-1 rounded border border-app bg-surface-2 px-3 text-sm text-app outline-none focus:ring-1 focus:ring-(--color-focus)"
                placeholder="新槽位名称"
              />
              <button
                type="button"
                onClick={() => {
                  onCreateSlot(slotName);
                  setSlotName('');
                }}
                className="rounded border border-app bg-surface-3 px-3 text-xs font-semibold text-app transition-colors hover:border-(--color-accent)"
              >
                新建
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {slots.map((slot) => {
                const isActive = slot.id === activeSlotId;
                const isRenaming = renamingSlotId === slot.id;
                return (
                  <div
                    key={slot.id}
                    className={cn(
                      'rounded-lg border p-3 transition-colors',
                      isActive
                        ? 'border-(--color-accent) bg-surface-3'
                        : 'border-app bg-surface-2 hover:border-(--color-accent)',
                    )}
                  >
                    {isRenaming ? (
                      <div className="flex gap-2">
                        <input
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename(slot.id);
                            if (e.key === 'Escape') setRenamingSlotId(null);
                          }}
                          className="h-8 min-w-0 flex-1 rounded border border-app bg-surface px-2 text-sm text-app outline-none"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => commitRename(slot.id)}
                          className="rounded border border-app px-2 text-xs text-app"
                        >
                          保存
                        </button>
                      </div>
                    ) : (
                      <>
                        <div>
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1 truncate text-sm font-semibold text-app">
                              {slot.name}
                            </div>
                            {isActive && (
                              <span className="rounded bg-accent-strong px-2 py-0.5 text-[10px] font-semibold text-white">
                                当前
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-[11px] text-muted">
                            {new Date(slot.updatedAt).toLocaleString()}
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingSlotId(slot.id);
                              setRenameValue(slot.name);
                            }}
                            className="rounded border border-app px-2 py-1 text-[11px] text-accent hover:border-(--color-accent)"
                          >
                            重命名
                          </button>
                          <button
                            type="button"
                            onClick={() => onDuplicateSlot(`${slot.name} 副本`)}
                            className="rounded border border-app px-2 py-1 text-[11px] text-accent hover:border-(--color-accent)"
                          >
                            创建副本
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`确定删除槽位「${slot.name}」吗？`))
                                onDeleteSlot(slot.id);
                            }}
                            className="rounded border border-app px-2 py-1 text-[11px] text-danger hover:border-(--color-danger)"
                          >
                            删除
                          </button>
                          <button
                            type="button"
                            disabled={isActive}
                            onClick={() => onSwitchSlot(slot.id)}
                            className={cn(
                              'ml-auto rounded border border-app px-2 py-1 text-[11px]',
                              !isActive
                                ? 'text-accent hover:border-(--color-accent)'
                                : 'text-muted opacity-50',
                            )}
                          >
                            切换
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid min-h-0 grid-rows-2">
            <div className="flex min-h-0 flex-col border-b border-app p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-app">导出工程</div>
                  <div className="text-xs text-muted">导出内容包含 FFLogs 事件和已排减伤。</div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={onGenerateExport}
                    className="rounded border border-app bg-surface-3 px-3 py-2 text-xs font-semibold text-app transition-colors hover:border-(--color-accent) disabled:opacity-50"
                  >
                    生成
                  </button>
                  <button
                    type="button"
                    disabled={!exportContent}
                    onClick={handleCopy}
                    className="rounded bg-primary-action px-3 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-50"
                  >
                    {copied ? '已复制' : '复制'}
                  </button>
                  <button
                    type="button"
                    disabled={!exportContent}
                    onClick={handleDownload}
                    className="rounded border border-app bg-surface-3 px-3 py-2 text-xs font-semibold text-app transition-colors hover:border-(--color-accent) disabled:opacity-50"
                  >
                    下载
                  </button>
                </div>
              </div>
              <textarea
                value={exportContent}
                readOnly
                onClick={(e) => e.currentTarget.select()}
                className="min-h-0 flex-1 resize-none rounded border border-app bg-surface p-3 font-mono text-xs text-accent outline-none"
                aria-label="工程导出内容"
              />
            </div>

            <div className="flex min-h-0 flex-col p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-app">导入工程</div>
                  <div className="text-xs text-muted">导入后会创建新槽位并切换到该槽位。</div>
                </div>
                <div className="flex gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xmc,.txt,text/plain"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded border border-app bg-surface-3 px-3 py-2 text-xs font-semibold text-app transition-colors hover:border-(--color-accent) disabled:opacity-50"
                  >
                    选择文件
                  </button>
                  <button
                    type="button"
                    disabled={isBusy || !importContent.trim()}
                    onClick={() => onImport(importContent)}
                    className="rounded bg-accent-strong px-3 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-50"
                  >
                    导入
                  </button>
                </div>
              </div>
              <textarea
                value={importContent}
                onChange={(e) => setImportContent(e.target.value)}
                className="min-h-0 flex-1 resize-none rounded border border-app bg-surface p-3 font-mono text-xs text-app outline-none focus:ring-1 focus:ring-(--color-focus)"
                placeholder="粘贴 XMC1: 开头的工程文本"
                aria-label="工程导入内容"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function sanitizeFileName(name: string): string {
  const trimmed = name.trim().replace(/[\\/:*?"<>|]+/g, '-');
  return trimmed || 'xiv-mit-composer';
}
