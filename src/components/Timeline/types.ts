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
