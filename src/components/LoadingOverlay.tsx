interface Props {
  isLoading: boolean;
  isRendering: boolean;
}

export function LoadingOverlay({ isLoading, isRendering }: Props) {
  if (!isLoading && !isRendering) return null;

  return (
    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-50 flex flex-col items-center justify-center text-white">
      <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500 mb-4"></div>
      <p className="text-lg font-semibold animate-pulse">{isLoading ? '正在加载数据...' : '正在渲染...'}</p>
      <p className="text-sm text-gray-400 mt-2">数据量较大时可能需要几秒钟</p>
    </div>
  );
}
