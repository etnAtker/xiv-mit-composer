import { useEffect, useState } from 'react';

import { DEFAULT_ZOOM, MAX_ZOOM, MIN_ZOOM } from '../../constants/timeline';

const ZOOM_STEP = 10;

interface Props {
  zoom: number;
  setZoom: (value: number) => void;
  onClear: () => void;
}

export function TimelineToolbar({ zoom, setZoom, onClear }: Props) {
  const [localZoom, setLocalZoom] = useState<string | number>(zoom);

  useEffect(() => {
    setLocalZoom(zoom);
  }, [zoom]);

  const commitZoom = () => {
    let val = typeof localZoom === 'string' ? parseInt(localZoom) : localZoom;
    if (isNaN(val)) val = DEFAULT_ZOOM;
    val = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, val));
    setZoom(val);
    setLocalZoom(val);
  };

  return (
    <div className="relative z-20 flex flex-wrap items-center gap-3 bg-surface-2 px-4 py-2 text-app">
      <span className="mr-2 text-[10px] font-mono uppercase tracking-widest text-muted">
        Timeline Scale
      </span>

      <div className="flex items-center rounded border border-app bg-surface-3 p-1">
        <button
          type="button"
          className="flex h-6 w-7 items-center justify-center rounded border border-app bg-surface text-xs text-muted transition-colors hover:border-(--color-accent) hover:text-app"
          onClick={() => setZoom(Math.max(MIN_ZOOM, zoom - ZOOM_STEP))}
        >
          -
        </button>
        <div className="relative mx-1 flex items-center">
          <input
            type="number"
            value={localZoom}
            onChange={(e) => setLocalZoom(e.target.value)}
            onBlur={commitZoom}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitZoom();
                e.currentTarget.blur();
              }
            }}
            aria-label="时间轴缩放"
            className="h-6 w-12 appearance-none rounded bg-transparent text-center text-[11px] font-mono text-app focus:outline-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="ml-1 select-none font-mono text-[10px] text-muted">px/s</span>
        </div>
        <button
          type="button"
          className="flex h-6 w-7 items-center justify-center rounded border border-app bg-surface text-xs text-muted transition-colors hover:border-(--color-accent) hover:text-app"
          onClick={() => setZoom(Math.min(MAX_ZOOM, zoom + ZOOM_STEP))}
        >
          +
        </button>
      </div>

      <div className="mx-2 h-4 w-px bg-(--color-border)"></div>

      <button
        type="button"
        className="rounded border border-app bg-surface-3 px-3 py-1 text-[10px] text-muted transition-colors hover:border-(--color-accent) hover:text-app"
        onClick={() => setZoom(DEFAULT_ZOOM)}
      >
        Reset
      </button>

      <button
        type="button"
        className="rounded border border-app bg-surface-3 px-3 py-1 text-[10px] text-danger transition-colors hover:border-(--color-danger) hover:text-white"
        onClick={() => {
          if (confirm('确定要清空所有已排的技能吗？此操作无法撤销。')) {
            onClear();
          }
        }}
      >
        清空技能
      </button>
    </div>
  );
}
