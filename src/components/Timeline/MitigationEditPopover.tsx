import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MitEvent } from '../../model/types';
import { MS_PER_SEC, TIME_DECIMAL_PLACES } from '../../constants/time';

interface Props {
  mit: MitEvent;
  editPosition?: { x: number; y: number } | null;
  canUpdateStart?: (tStartMs: number) => boolean;
  onUpdate: (updates: Partial<MitEvent>) => void;
  onRemove: () => void;
  onClose: () => void;
  onInvalidSubmit: () => void;
}

export function MitigationEditPopover({
  mit,
  editPosition,
  canUpdateStart,
  onUpdate,
  onRemove,
  onClose,
  onInvalidSubmit,
}: Props) {
  const [isEditInvalid, setIsEditInvalid] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);

  const handleEditSubmit = () => {
    const rawValue = editInputRef.current?.value ?? '';
    const val = parseFloat(rawValue);
    if (isNaN(val)) return;

    const nextStartMs = val * MS_PER_SEC;
    if (Math.abs(nextStartMs - mit.tStartMs) < 0.5) {
      onClose();
      return;
    }

    if (canUpdateStart && !canUpdateStart(nextStartMs)) {
      onInvalidSubmit();
      return;
    }

    onClose();
    onUpdate({
      tStartMs: nextStartMs,
      tEndMs: nextStartMs + mit.durationMs,
    });
  };

  const handleEditBlur = () => {
    if (!canUpdateStart) return;
    const rawValue = editInputRef.current?.value ?? '';
    const val = parseFloat(rawValue);
    if (isNaN(val)) return;
    const nextStartMs = val * MS_PER_SEC;
    setIsEditInvalid(!canUpdateStart(nextStartMs));
  };

  const content = (
    <div
      className={`${
        editPosition ? 'fixed z-50' : 'absolute left-0 top-full z-30 mt-2'
      } min-w-40 rounded-lg border border-app bg-surface-3 p-3 shadow-2xl backdrop-blur-xl flex flex-col gap-2 text-app`}
      style={editPosition ? { left: editPosition.x, top: editPosition.y } : undefined}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted font-mono">
        编辑事件
      </label>

      <div className="flex items-center gap-2">
        <label className="whitespace-nowrap text-[10px] text-muted font-mono">开始(s):</label>
        <div className="relative">
          <input
            autoFocus
            className={`w-16 rounded-md border bg-surface px-2 py-1 text-[11px] font-mono text-app focus:outline-none focus:ring-2 ${
              isEditInvalid
                ? 'border-red-500 focus:ring-red-500/40'
                : 'border-app focus:ring-(--color-focus)'
            }`}
            ref={editInputRef}
            defaultValue={(mit.tStartMs / MS_PER_SEC).toFixed(TIME_DECIMAL_PLACES)}
            aria-label="开始时间（秒）"
            onKeyDown={(e) => e.key === 'Enter' && handleEditSubmit()}
            onBlur={handleEditBlur}
            onFocus={() => setIsEditInvalid(false)}
          />
          {isEditInvalid && (
            <span
              className="absolute -right-5 top-1/2 -translate-y-1/2 text-red-500 text-[20px] font-bold cursor-help"
              title="CD 冲突，无法应用"
            >
              ×
            </span>
          )}
        </div>
      </div>

      <div className="mt-1 flex items-center justify-between border-t border-app pt-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-danger transition-colors hover:bg-(--color-danger)/10 hover:text-white active:scale-[0.98]"
        >
          <span aria-hidden="true">🗑️</span> 删除
        </button>

        <button
          type="button"
          onClick={handleEditSubmit}
          className="rounded-md bg-primary-action px-3 py-1 text-[11px] text-white transition-colors hover:bg-[#2ea043] active:scale-[0.98]"
        >
          确定
        </button>
      </div>
    </div>
  );

  if (editPosition && typeof document !== 'undefined') {
    return createPortal(content, document.body);
  }

  return content;
}
