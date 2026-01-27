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
  const effectHeight = (mit.durationMs / MS_PER_SEC) * zoom;
  const cooldownMs = (skill?.cooldownSec ?? 0) * MS_PER_SEC;
  const cooldownHeight = (cooldownMs / MS_PER_SEC) * zoom;
  const totalHeight = MITIGATION_HEADER_HEIGHT + effectHeight + cooldownHeight;
  return { effectHeight, cooldownHeight, totalHeight };
}
