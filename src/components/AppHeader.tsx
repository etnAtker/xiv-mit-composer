import githubIcon from '../../assets/github.svg';

interface Props {
  apiKey: string;
  fflogsUrl: string;
  isLoading: boolean;
  canLoad: boolean;
  canExport: boolean;
  error: string | null;
  onApiKeyChange: (value: string) => void;
  onFflogsUrlChange: (value: string) => void;
  onLoadFight: () => void;
  onExportTimeline: () => void;
}

export function AppHeader({
  apiKey,
  fflogsUrl,
  isLoading,
  canLoad,
  canExport,
  error,
  onApiKeyChange,
  onFflogsUrlChange,
  onLoadFight,
  onExportTimeline,
}: Props) {
  return (
    <div className="p-4 bg-gray-900 border-b border-gray-800 flex flex-wrap gap-4 items-center z-20 relative shadow-md">
      <div className="mr-4 font-bold text-xl bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
        XIV Mitigation Composer
      </div>

      <div className="flex gap-2 items-center bg-gray-800 p-1.5 rounded-lg border border-gray-700 shadow-inner">
        <input
          type="password"
          value={apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          className="bg-transparent border-none focus:ring-0 text-sm w-64 px-2 text-gray-200 placeholder-gray-600 outline-none"
          placeholder="API Key"
        />
        <div className="w-[1px] h-4 bg-gray-700"></div>
        <input
          type="text"
          value={fflogsUrl}
          onChange={(e) => onFflogsUrlChange(e.target.value)}
          className="bg-transparent border-none focus:ring-0 text-sm w-[32rem] px-2 text-gray-200 placeholder-gray-600 outline-none"
          placeholder="FFLogs URL (e.g., https://cn.fflogs.com/reports/...)"
        />
      </div>

      <button
        onClick={onLoadFight}
        disabled={isLoading || !canLoad}
        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:bg-gray-800 px-5 py-2 rounded-lg text-sm font-semibold transition-all shadow-lg active:scale-95 flex items-center gap-2 text-white"
      >
        {isLoading ? <span className="animate-spin">?</span> : '加载战斗'}
      </button>

      <div className="flex-1"></div>

      <div className="flex gap-3">
        <button
          onClick={onExportTimeline}
          disabled={!canExport}
          className="bg-green-800 hover:bg-green-700 disabled:opacity-50 px-4 py-2 rounded-lg text-xs font-semibold transition-colors border border-gray-700 text-green-100 shadow-sm hover:text-white"
        >
          导出 Souma 时间轴
        </button>
        <a
          href="https://github.com/etnAtker/xiv-mit-composer"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-gray-800 hover:bg-gray-700 px-3 py-2 rounded-lg transition-colors border border-gray-700 text-gray-300 hover:text-white shadow-sm flex items-center justify-center group"
          title="View on GitHub"
        >
          <img
            src={githubIcon}
            alt="GitHub"
            className="w-5 h-5 invert opacity-75 group-hover:opacity-100"
          />
        </a>
      </div>

      {error && (
        <div className="absolute top-full left-0 w-full bg-red-900/90 text-red-100 text-xs px-4 py-2 flex justify-center backdrop-blur-sm z-30">
          {error}
        </div>
      )}
    </div>
  );
}
