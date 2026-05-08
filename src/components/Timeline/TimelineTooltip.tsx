import type { TooltipData } from './types';
import { XivIcon } from '../XivIcon';

interface Props {
  tooltip: TooltipData | null;
}

export function TimelineTooltip({ tooltip }: Props) {
  if (!tooltip) return null;

  return (
    <div
      className="fixed z-30 pointer-events-none min-w-30 rounded-lg border border-app bg-surface-3 text-[11px] text-app shadow-2xl backdrop-blur-xl flex flex-col p-2 animate-[fade-in-up_0.2s_ease]"
      style={{
        left: tooltip.x,
        top: tooltip.y,
        transform: 'translate(-50%, -100%)',
      }}
    >
      {tooltip.items.map((item, idx) => (
        <div
          key={idx}
          className={`flex items-center justify-between gap-3 ${
            idx > 0 ? 'mt-1 border-t border-app pt-1' : ''
          }`}
        >
          {item.icon && (
            <XivIcon localSrc={item.icon} alt="" className="h-4 w-4 shrink-0 object-contain" />
          )}
          <span
            className="min-w-0 flex-1 font-medium leading-tight"
            style={{ color: item.color || 'var(--color-text)' }}
          >
            {item.title}
          </span>
          <span className="shrink-0 whitespace-pre-line text-right font-mono text-[10px] leading-tight text-muted">
            {item.subtitle}
          </span>
        </div>
      ))}
    </div>
  );
}
