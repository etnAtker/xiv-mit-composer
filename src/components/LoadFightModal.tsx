interface Props {
  isOpen: boolean;
  mode: 'single' | 'dual';
  onModeChange: (mode: 'single' | 'dual') => void;
  onConfirm: () => void;
  onClose: () => void;
}

export function LoadFightModal({ isOpen, mode, onModeChange, onConfirm, onClose }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-9999 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg border border-app bg-surface-3 text-app shadow-2xl">
        <div className="border-b border-app px-5 py-3">
          <div className="text-sm font-semibold text-app">加载战斗选项</div>
          <div className="mt-1 text-[11px] text-muted font-mono">
            选择加载模式（不会改变你的数据结构）
          </div>
        </div>

        <div className="px-5 py-4 space-y-3">
          <label className="flex items-start gap-3 rounded border border-app bg-surface p-3">
            <input
              type="radio"
              name="load-mode"
              checked={mode === 'single'}
              onChange={() => onModeChange('single')}
            />
            <div>
              <div className="text-sm font-semibold text-app">默认加载（单坦克）</div>
              <div className="text-[11px] text-muted">
                与当前逻辑一致，只加载所选玩家的减伤安排。
              </div>
            </div>
          </label>

          <label className="flex items-start gap-3 rounded border border-app bg-surface p-3">
            <input
              type="radio"
              name="load-mode"
              checked={mode === 'dual'}
              onChange={() => onModeChange('dual')}
            />
            <div>
              <div className="text-sm font-semibold text-app">加载实际双坦克</div>
              <div className="text-[11px] text-muted">
                自动识别战斗中两位坦克玩家并合并减伤安排。
              </div>
            </div>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-app px-5 py-3">
          <button
            type="button"
            className="rounded border border-app bg-surface px-3 py-1 text-[11px] text-muted hover:text-app"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="rounded border border-(--color-accent-strong) bg-accent-strong px-3 py-1 text-[11px] font-semibold text-white hover:bg-accent"
            onClick={onConfirm}
          >
            开始加载
          </button>
        </div>
      </div>
    </div>
  );
}
