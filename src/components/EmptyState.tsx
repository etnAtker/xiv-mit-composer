interface Props {
  hasFight: boolean;
  hasSelection: boolean;
}

export function EmptyState({ hasFight, hasSelection }: Props) {
  if (hasSelection) return null;

  return (
    <div className="m-auto text-muted text-center p-8 bg-app w-full h-full flex flex-col items-center justify-center">
      <p className="text-xl font-bold mb-3 text-app">欢迎使用 XIV 减伤排轴器</p>
      <p className="text-muted">
        {hasFight ? '请选择当前职业和玩家以开始。' : '请先在上方加载战斗数据。'}
      </p>
    </div>
  );
}
