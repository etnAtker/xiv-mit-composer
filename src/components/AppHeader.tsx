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
        <div className="w-px h-4 bg-(--color-border)"></div>
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
          <svg viewBox="0 0 98 96" width={20} height={20} aria-hidden="true" className="h-5 w-5">
            <path
              fill="var(--color-github)"
              d="M41.4395 69.3848C28.8066 67.8535 19.9062 58.7617 19.9062 46.9902C19.9062 42.2051 21.6289 37.0371 24.5 33.5918C23.2559 30.4336 23.4473 23.7344 24.8828 20.959C28.7109 20.4805 33.8789 22.4902 36.9414 25.2656C40.5781 24.1172 44.4062 23.543 49.0957 23.543C53.7852 23.543 57.6133 24.1172 61.0586 25.1699C64.0254 22.4902 69.2891 20.4805 73.1172 20.959C74.457 23.543 74.6484 30.2422 73.4043 33.4961C76.4668 37.1328 78.0937 42.0137 78.0937 46.9902C78.0937 58.7617 69.1934 67.6621 56.3691 69.2891C59.623 71.3945 61.8242 75.9883 61.8242 81.252L61.8242 91.2051C61.8242 94.0762 64.2168 95.7031 67.0879 94.5547C84.4102 87.9512 98 70.6289 98 49.1914C98 22.1074 75.9883 6.69539e-07 48.9043 4.309e-07C21.8203 1.92261e-07 -1.9479e-07 22.1074 -4.3343e-07 49.1914C-6.20631e-07 70.4375 13.4941 88.0469 31.6777 94.6504C34.2617 95.6074 36.75 93.8848 36.75 91.3008L36.75 83.6445C35.4102 84.2188 33.6875 84.6016 32.1562 84.6016C25.8398 84.6016 22.1074 81.1563 19.4277 74.7441C18.375 72.1602 17.2266 70.6289 15.0254 70.3418C13.877 70.2461 13.4941 69.7676 13.4941 69.1934C13.4941 68.0449 15.4082 67.1836 17.3223 67.1836C20.0977 67.1836 22.4902 68.9063 24.9785 72.4473C26.8926 75.2227 28.9023 76.4668 31.2949 76.4668C33.6875 76.4668 35.2187 75.6055 37.4199 73.4043C39.0469 71.7773 40.291 70.3418 41.4395 69.3848Z"
            />
          </svg>
        </a>
      </div>

      {error && (
        <div className="absolute top-full left-0 w-full bg-(--color-danger)/90 text-white text-xs px-4 py-2 flex justify-center backdrop-blur-sm z-30">
          {error}
        </div>
      )}
    </div>
  );
}
