interface Props {
  hasFight: boolean;
  hasSelection: boolean;
}

export function EmptyState({ hasFight, hasSelection }: Props) {
  if (hasSelection) return null;

  return (
    <div className="m-auto text-gray-500 text-center p-8 bg-gray-900 w-full h-full flex flex-col items-center justify-center">
      <p className="text-xl font-bold mb-3 text-gray-400">欢迎使用 XIV 减伤排轴器</p>
      <p className="text-gray-600">
        {hasFight ? '请选择当前职业和玩家以开始。' : '请先在上方加载战斗数据。'}
      </p>
    </div>
  );
}
