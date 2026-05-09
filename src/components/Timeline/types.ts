import type { Job } from '../../model/types';

export interface TooltipItem {
  title: string;
  subtitle: string;
  color?: string;
  icon?: string;
}

export interface TooltipData {
  x: number;
  y: number;
  items: TooltipItem[];
}

export interface TimelineSkillColumn {
  id: string;
  columnId: string;
  name: string;
  icon?: string;
  actionId?: number;
  job?: Job | 'ALL';
  ownerId?: number;
  ownerName?: string;
}
