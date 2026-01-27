import type { DamageEvent, MitEvent } from '../../model/types';
import type { TooltipData } from './types';
import { DamageLane, DamageLaneHitTargets } from './TimelineLanes';

interface Props {
  totalWidth: number;
  timelineHeight: number;
  zoom: number;
  dmgWidth: number;
  dmgX: number;
  secondaryDamageLaneLeft: number;
  visibleRange: { start: number; end: number };
  damageEvents: DamageEvent[];
  secondaryDamageEvents: DamageEvent[];
  primaryMitEvents: MitEvent[];
  secondaryMitEvents: MitEvent[];
  hasSecondaryDamageLane: boolean;
  primaryLineWidth: number;
  secondaryLineWidth: number;
  onHover: (data: TooltipData | null) => void;
}

export function DamageLayers({
  totalWidth,
  timelineHeight,
  zoom,
  dmgWidth,
  dmgX,
  secondaryDamageLaneLeft,
  visibleRange,
  damageEvents,
  secondaryDamageEvents,
  primaryMitEvents,
  secondaryMitEvents,
  hasSecondaryDamageLane,
  primaryLineWidth,
  secondaryLineWidth,
  onHover,
}: Props) {
  return (
    <>
      <svg
        width={totalWidth}
        height={timelineHeight}
        className="absolute inset-0 z-40 block text-xs pointer-events-none"
      >
        <DamageLane
          events={damageEvents}
          mitEvents={primaryMitEvents}
          zoom={zoom}
          width={dmgWidth}
          left={dmgX}
          visibleRange={visibleRange}
          onHover={onHover}
          lineWidth={primaryLineWidth}
        />
        {hasSecondaryDamageLane && (
          <DamageLane
            events={secondaryDamageEvents}
            mitEvents={secondaryMitEvents}
            zoom={zoom}
            width={dmgWidth}
            left={secondaryDamageLaneLeft}
            visibleRange={visibleRange}
            onHover={onHover}
            lineWidth={secondaryLineWidth}
          />
        )}
      </svg>

      <div className="absolute inset-0 z-41 pointer-events-none" style={{ height: timelineHeight }}>
        <DamageLaneHitTargets
          events={damageEvents}
          mitEvents={primaryMitEvents}
          zoom={zoom}
          width={dmgWidth}
          left={dmgX}
          visibleRange={visibleRange}
          onHover={onHover}
        />
        {hasSecondaryDamageLane && (
          <DamageLaneHitTargets
            events={secondaryDamageEvents}
            mitEvents={secondaryMitEvents}
            zoom={zoom}
            width={dmgWidth}
            left={secondaryDamageLaneLeft}
            visibleRange={visibleRange}
            onHover={onHover}
          />
        )}
      </div>
    </>
  );
}
