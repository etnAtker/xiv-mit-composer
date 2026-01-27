import githubIcon from '../../assets/github.svg';

interface Props {
  apiKey: string;
  fflogsUrl: string;
  isLoading: boolean;
  canExport: boolean;
  error: string | null;
  theme: 'light' | 'dark';
  onApiKeyChange: (value: string) => void;
  onFflogsUrlChange: (value: string) => void;
  onLoadFight: () => void;
  onExportTimeline: () => void;
  onToggleTheme: () => void;
}

export function AppHeader({
  apiKey,
  fflogsUrl,
  isLoading,
  canExport,
  error,
  theme,
  onApiKeyChange,
  onFflogsUrlChange,
  onLoadFight,
  onExportTimeline,
  onToggleTheme,
}: Props) {
  return (
    <div className="p-4 bg-surface-2 border-b border-app flex flex-wrap gap-4 items-center z-20 relative shadow-md">
      <div className="mr-4 font-bold text-xl bg-clip-text text-transparent bg-linear-to-r from-[#0969da] via-[#1f6feb] to-[#2f81f7]">
        XIV Mitigation Composer
      </div>

      <div className="flex gap-2 items-center bg-surface-1 p-1.5 rounded-lg border border-app shadow-inner">
        <input
          type="password"
          value={apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          aria-label="FFLogs API Key"
          className="bg-transparent border-none focus:ring-0 text-sm w-64 px-2 text-app placeholder:text-muted outline-none"
          placeholder="API Key"
        />
        <div className="w-px h-4 bg-[var(--color-border)]"></div>
        <input
          type="text"
          value={fflogsUrl}
          onChange={(e) => onFflogsUrlChange(e.target.value)}
          aria-label="FFLogs 报告 URL"
          className="bg-transparent border-none focus:ring-0 text-sm w-lg px-2 text-app placeholder:text-muted outline-none"
          placeholder="FFLogs URL (e.g., https://cn.fflogs.com/reports/...)"
        />
      </div>

      <button
        type="button"
        onClick={onLoadFight}
        disabled={isLoading}
        className="bg-accent-strong hover:bg-accent disabled:opacity-50 disabled:bg-surface-3 px-5 py-2 rounded-lg text-sm font-semibold transition-all shadow-lg active:scale-95 flex items-center gap-2 text-white"
      >
        {isLoading ? <span className="animate-spin">?</span> : '加载战斗'}
      </button>

      <div className="flex-1"></div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onExportTimeline}
          disabled={!canExport}
          className="bg-primary-action hover:bg-[#2ea043] disabled:opacity-50 px-4 py-2 rounded-lg text-xs font-semibold transition-colors border border-app text-white shadow-sm"
        >
          导出 Souma 时间轴
        </button>
        <button
          type="button"
          onClick={onToggleTheme}
          className="bg-surface-1 hover:bg-surface-2 size-9 rounded-full transition-colors border border-app text-muted hover:text-app shadow-sm flex items-center justify-center"
          aria-label="切换亮色/暗色模式"
        >
          {theme === 'dark' ? (
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 3a1 1 0 0 1 1 1v1.2a1 1 0 1 1-2 0V4a1 1 0 0 1 1-1Zm0 14.8a5.8 5.8 0 1 0 0-11.6 5.8 5.8 0 0 0 0 11.6Zm0 2a7.8 7.8 0 1 1 0-15.6 7.8 7.8 0 0 1 0 15.6Zm9-7.8a1 1 0 0 1-1 1h-1.2a1 1 0 1 1 0-2H20a1 1 0 0 1 1 1Zm-16.8 0a1 1 0 0 1-1 1H2a1 1 0 1 1 0-2h1.2a1 1 0 0 1 1 1Zm13.1 5.7a1 1 0 0 1 0 1.4l-.9.9a1 1 0 1 1-1.4-1.4l.9-.9a1 1 0 0 1 1.4 0Zm-9.8-9.8a1 1 0 0 1 0 1.4l-.9.9a1 1 0 1 1-1.4-1.4l.9-.9a1 1 0 0 1 1.4 0Zm9.8-1.4a1 1 0 0 1-1.4 0l-.9-.9a1 1 0 1 1 1.4-1.4l.9.9a1 1 0 0 1 0 1.4Zm-9.8 9.8a1 1 0 0 1-1.4 0l-.9-.9a1 1 0 0 1 1.4-1.4l.9.9a1 1 0 0 1 0 1.4Z"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
              <path
                fill="currentColor"
                d="M14.5 2a1 1 0 0 1 1 1 9 9 0 1 1-9 9 1 1 0 0 1 1-1 7 7 0 0 0 7-7 1 1 0 0 1 1-1Z"
              />
            </svg>
          )}
        </button>
        <a
          href="https://github.com/etnAtker/xiv-mit-composer"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-surface-1 hover:bg-surface-2 px-3 py-2 rounded-lg transition-colors border border-app text-muted hover:text-app shadow-sm flex items-center justify-center group"
          title="View on GitHub"
        >
          <img
            src={githubIcon}
            alt="GitHub"
            width={20}
            height={20}
            className="w-5 h-5 invert opacity-75 group-hover:opacity-100"
          />
        </a>
      </div>

      {error && (
        <div className="absolute top-full left-0 w-full bg-[var(--color-danger)]/90 text-white text-xs px-4 py-2 flex justify-center backdrop-blur-sm z-30">
          {error}
        </div>
      )}
    </div>
  );
}
