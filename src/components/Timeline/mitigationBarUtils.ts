import type { MitEvent } from '../../model/types';
import { MS_PER_SEC } from '../../constants/time';

export const MITIGATION_HEADER_HEIGHT = 40;

export interface MitigationBarHeights {
  effectHeight: number;
  totalHeight: number;
}

export function getMitigationBarHeights(mit: MitEvent, zoom: number): MitigationBarHeights {
  const effectSec = mit.durationMs / MS_PER_SEC;
  const effectHeight = effectSec * zoom - MITIGATION_HEADER_HEIGHT;
  const totalHeight = effectHeight + MITIGATION_HEADER_HEIGHT;
  return { effectHeight, totalHeight };
}
