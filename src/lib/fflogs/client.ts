import type { FFlogsApiV1ReportEvents, ReportResponse } from './compat/types';

// 获取 API 基础链接
const BASE_URL = 'https://cn.fflogs.com/v1';

export class FFLogsClient {
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async fetchReport(reportCode: string): Promise<ReportResponse> {
        const url = `${BASE_URL}/report/fights/${reportCode}?api_key=${this.apiKey}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`获取报告失败: ${res.statusText}`);
        return res.json() as Promise<ReportResponse>;
    }

    async fetchEvents<T = FFlogsApiV1ReportEvents>(
        reportCode: string,
        startTime: number,
        endTime: number,
        sourceId?: number,
        isEnemy: boolean = false,
        type: 'damage-taken' | 'casts' = 'casts'
    ): Promise<T[]> {
        const events: T[] = [];
        const params = new URLSearchParams({
            api_key: this.apiKey,
            start: startTime.toString(),
            end: endTime.toString(),
        });

        if (sourceId) params.append('sourceid', sourceId.toString());

        if (type === 'casts') {
            // 敌方使用 hostility=1，友方使用 hostility=0
            const hostility = isEnemy ? 1 : 0;
            params.append('hostility', hostility.toString());
        }

        const fetchPage = async (nextTimestamp: number) => {
            // 分页时更新起始时间
            params.set('start', nextTimestamp.toString());

            const url = `${BASE_URL}/report/events/${type}/${reportCode}?${params.toString()}`;

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
