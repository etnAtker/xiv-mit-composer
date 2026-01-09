import type { Friendlies, FFlogsApiV1ReportEvents } from './compat/types';

// 获取 API 基础链接
const BASE_URL = 'https://cn.fflogs.com/v1';

export class FFLogsClient {
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async fetchFights(reportCode: string) {
        const url = `${BASE_URL}/report/fights/${reportCode}?api_key=${this.apiKey}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`FFLogs API Error: ${response.status} ${response.statusText}`);
        }
        return response.json();
    }

    async fetchEvents(
        reportCode: string,
        startTime: number,
        endTime: number,
        sourceId: number,
        isEnemy: boolean
    ): Promise<FFlogsApiV1ReportEvents[]> {
        const events: FFlogsApiV1ReportEvents[] = [];
        const hostility = isEnemy ? 1 : 0;

        const fetchPage = async (start: number) => {
            const url = `${BASE_URL}/report/events/casts/${reportCode}?start=${start}&end=${endTime}&hostility=${hostility}&sourceid=${sourceId}&api_key=${this.apiKey}`;
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`FFLogs API Error: ${response.status}`);
            }
            const data = await response.json();

            if (data.events) {
                events.push(...data.events);
            }

            if (data.nextPageTimestamp && data.nextPageTimestamp > 0 && data.nextPageTimestamp < endTime) {
                await fetchPage(data.nextPageTimestamp);
            }
        };

        await fetchPage(startTime);
        return events;
    }
}

/**
 * 根据图标过滤友方单位
 */
export function filterFriendliesByJob(friendlies: Friendlies[], jobIcon: string): Friendlies[] {
    // 严格匹配职业图标
    return friendlies.filter(p => p.icon === jobIcon);
}
