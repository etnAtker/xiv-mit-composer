import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 解析 FFLogs URL，提取 reportCode 和 fightId
 */
export function parseFFLogsUrl(url: string): { reportCode: string; fightId: string } | null {
  try {
    // 去掉首尾空白
    const cleanUrl = url.trim();

    // 校验并匹配 FFLogs URL
    const fflogsRegex = /.*fflogs\.com\/reports\/([a-zA-Z0-9]+)(?:\?.*fight=([^&\s]+))?/;
    const match = cleanUrl.match(fflogsRegex);

    if (!match) {
      return null;
    }

    const reportCode = match[1];
    const fightId = match[2] || 'last';

    return { reportCode, fightId };
  } catch (error) {
    console.error('Error parsing FFLogs URL:', error);
    return null;
  }
}
