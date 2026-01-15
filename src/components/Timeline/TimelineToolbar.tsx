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
    <div className="flex items-center px-4 py-2 bg-gray-900 border-b border-gray-800 gap-3 shadow-sm z-10">
      <span className="text-xs text-gray-500 font-bold uppercase tracking-wider mr-2">时间轴缩放</span>

      <div className="flex items-center bg-gray-800 rounded-lg p-1 border border-gray-700">
        <button
          className="w-8 h-6 flex items-center justify-center bg-gray-700 hover:bg-gray-600 rounded text-gray-300 hover:text-white text-md transition-colors"
          onClick={() => setZoom(Math.max(MIN_ZOOM, zoom - ZOOM_STEP))}
        >
          -
        </button>
        <div className="flex items-center mx-1 relative">
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
            className="w-12 h-6 bg-transparent text-center text-xs text-gray-300 font-mono focus:outline-none focus:bg-gray-700 rounded transition-colors appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="text-xs text-gray-500 font-mono ml-1 select-none">px/s</span>
        </div>
        <button
          className="w-8 h-6 flex items-center justify-center bg-gray-700 hover:bg-gray-600 rounded text-gray-300 hover:text-white text-md transition-colors"
          onClick={() => setZoom(Math.min(MAX_ZOOM, zoom + ZOOM_STEP))}
        >
          +
        </button>
      </div>

      <div className="w-[1px] h-4 bg-gray-800 mx-2"></div>

      <button
        className="px-3 py-1 bg-gray-800 border border-gray-700 hover:bg-gray-700 text-gray-300 hover:text-white rounded text-xs transition-colors"
        onClick={() => setZoom(DEFAULT_ZOOM)}
      >
        重置视图
      </button>

      <button
        className="px-3 py-1 bg-gray-800 border border-gray-700 hover:bg-red-900/50 text-red-400 hover:text-red-300 rounded text-xs transition-colors"
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
