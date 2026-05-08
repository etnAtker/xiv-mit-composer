interface Props {
  isOpen: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function LoadFightModal({ isOpen, onConfirm, onClose }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-9999 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg border border-app bg-surface-3 text-app shadow-2xl">
        <div className="border-b border-app px-5 py-3">
          <div className="text-sm font-semibold text-app">加载战斗选项</div>
          <div className="mt-1 text-[11px] text-muted font-mono">
            先加载战斗元数据，再选择最多 8 名参与玩家。
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="rounded border border-app bg-surface p-3 text-sm text-muted">
            加载元数据后会打开玩家选择窗口。队伍成员可为任意职业构成，重复职业按玩家 ID
            独立计算技能冷却。
          </div>
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
