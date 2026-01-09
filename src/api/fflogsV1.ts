const BASE_URL = 'https://cn.fflogs.com/v1';

interface FFLogsFight {
    id: number;
    start_time: number;
    end_time: number;
    name: string;
}

interface ReportResponse {
    fights: FFLogsFight[];
    friendlies: {
        id: number;
        name: string;
        type: string;
        fights: { id: number }[];
    }[];
    enemies: {
        id: number;
        name: string;
        type: string;
        fights: { id: number }[];
    }[];
}

export const fetchReport = async (reportCode: string, apiKey: string) => {
    const url = `${BASE_URL}/report/fights/${reportCode}?api_key=${apiKey}&translate=true`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`获取报告失败: ${res.statusText}`);
    const data = (await res.json()) as ReportResponse;
    return data;
};

export const fetchEvents = async <T>(
    reportCode: string,
    apiKey: string,
    fightId: number,
    type: 'damage-taken' | 'casts',
    start: number,
    end: number,
    actorId?: number,
    hostility?: number // 1 代表敌人
): Promise<T[]> => {
    const params = new URLSearchParams({
        api_key: apiKey,
        start: start.toString(),
        end: end.toString(),
        fight: fightId.toString(),
    });

    if (actorId) params.append('sourceid', actorId.toString()); // 针对 damage-taken
    if (hostility) params.append('hostility', hostility.toString()); // 针对 casts

    // 对于 casts，我们需要源头是敌人的事件。
    // FFLogs V1 'casts' 配合 hostility=1 适用于敌人。

    const url = `${BASE_URL}/report/events/${type}/${reportCode}?${params.toString()}`;
    console.log(`[FFLogs] Fetching: ${url.replace(apiKey, 'HIDDEN_KEY')}`);

    const res = await fetch(url);
    if (!res.ok) {
        console.error(`[FFLogs] API Error: ${res.status} ${res.statusText}`);
        throw new Error(`获取事件 ${type} 失败: ${res.statusText}`);
    }

    const data = await res.json();
    return (data.events || []) as T[];
};
