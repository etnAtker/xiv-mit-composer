export interface TooltipItem {
  title: string;
  subtitle: string;
  color?: string;
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
  color?: string;
  icon?: string;
  actionId?: number;
  job?: string;
}
