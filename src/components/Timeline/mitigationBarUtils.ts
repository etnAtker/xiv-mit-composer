import type { MitEvent, Skill } from '../../model/types';
import { MS_PER_SEC } from '../../constants/time';

export const MITIGATION_HEADER_HEIGHT = 40;

export interface MitigationBarHeights {
  effectHeight: number;
  cooldownHeight: number;
  totalHeight: number;
}

export function getMitigationBarHeights(
  mit: MitEvent,
  zoom: number,
  skill?: Skill,
): MitigationBarHeights {
  const effectSec = mit.durationMs / MS_PER_SEC;
  const effectHeight = effectSec * zoom - MITIGATION_HEADER_HEIGHT;
  const cooldownSec = skill?.cooldownSec ?? 0;
  const cooldownHeight = Math.max(cooldownSec - effectSec, 0) * zoom;
  const totalHeight = effectHeight + cooldownHeight;
  return { effectHeight, cooldownHeight, totalHeight };
}
