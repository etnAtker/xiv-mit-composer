import { MS_PER_SEC } from '../../constants/time';

interface Props {
  totalWidth: number;
  totalHeight: number;
  rulerWidth: number;
  castX: number;
  castWidth: number;
  dmgX: number;
  dmgWidth: number;
  mitX: number;
  mitAreaWidth: number;
  durationSec: number;
  zoom: number;
  visibleRange: { start: number; end: number };
  visibleRangeBufferMs: number;
  rulerStepSec: number;
}

export function TimelineGridLines({
  totalWidth,
  totalHeight,
  rulerWidth,
  castX,
  castWidth,
  dmgX,
  dmgWidth,
  mitX,
  mitAreaWidth,
  durationSec,
  zoom,
  visibleRange,
  visibleRangeBufferMs,
  rulerStepSec,
}: Props) {
  return (
    <svg
      width={totalWidth}
      height={totalHeight}
      className="absolute inset-0 z-10 block text-xs pointer-events-none"
    >
      <defs>
        <pattern
          id="diagonalHatchCooldown"
          width="10"
          height="10"
          patternTransform="rotate(45 0 0)"
          patternUnits="userSpaceOnUse"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="10"
            style={{ stroke: 'var(--color-text-muted)', strokeWidth: 1 }}
          />
        </pattern>
        <pattern
          id="diagonalHatchUnusable"
          width="10"
          height="10"
          patternTransform="rotate(45 0 0)"
          patternUnits="userSpaceOnUse"
        >
          <line x1="0" y1="0" x2="0" y2="10" style={{ stroke: '#d29922', strokeWidth: 1 }} />
        </pattern>
      </defs>

      <rect x={0} y={0} width={rulerWidth} height={totalHeight} fill="transparent" />
      <rect x={castX} y={0} width={castWidth} height={totalHeight} fill="transparent" />
      <rect x={dmgX} y={0} width={dmgWidth} height={totalHeight} fill="transparent" />
      <rect x={mitX} y={0} width={mitAreaWidth} height={totalHeight} fill="transparent" />

      {Array.from({ length: Math.ceil(durationSec / rulerStepSec) }).map((_, i) => {
        const sec = i * rulerStepSec;
        const ms = sec * MS_PER_SEC;
        if (
          ms < visibleRange.start - visibleRangeBufferMs ||
          ms > visibleRange.end + visibleRangeBufferMs
        )
          return null;

        const y = sec * zoom;
        return (
          <g key={sec}>
            <line
              x1={0}
              y1={y}
              x2={totalWidth}
              y2={y}
              stroke="var(--color-border)"
              strokeWidth={1}
              opacity={0.35}
            />
          </g>
        );
      })}
    </svg>
  );
}
