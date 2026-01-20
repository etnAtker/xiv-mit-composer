import { useState } from 'react';
import { cn } from '../utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  content: string;
  enableTTS: boolean;
  onTtsChange: (enabled: boolean) => void;
}

export function ExportModal({ isOpen, onClose, content, enableTTS, onTtsChange }: Props) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy/copy failed', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div
        className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col h-[70vh] animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-modal-title"
      >
        <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900/50 rounded-t-xl">
          <h3 className="font-bold text-gray-200 text-lg" id="export-modal-title">
            导出 Souma 时间轴
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-4 flex-1 overflow-hidden flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-400">
              请复制以下内容并粘贴到 ff14-overlay-vue 的时间轴设置文件中。
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer hover:text-white transition-colors">
              <input
                type="checkbox"
                checked={enableTTS}
                onChange={(e) => onTtsChange(e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-800 cursor-pointer"
              />
              <span>生成TTS</span>
            </label>
          </div>
          <textarea
            className="w-full flex-1 bg-gray-950 border border-gray-700 rounded-lg p-3 font-mono text-xs text-green-400 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 custom-scrollbar"
            value={content}
            readOnly
            aria-label="导出内容"
            onClick={(e) => e.currentTarget.select()}
          />
        </div>

        <div className="p-4 border-t border-gray-700 flex justify-end gap-3 bg-gray-900/50 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
          >
            关闭
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-bold text-white transition-all shadow-lg flex items-center gap-2',
              copied ? 'bg-green-600 hover:bg-green-500' : 'bg-blue-600 hover:bg-blue-500',
            )}
          >
            {copied ? '已复制！' : '复制内容'}
          </button>
        </div>
      </div>
    </div>
  );
}
