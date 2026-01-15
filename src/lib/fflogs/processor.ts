import type { FFlogsApiV1ReportEvents, FFlogsStance } from './compat/types';
import { MS_PER_SEC, TIME_DECIMAL_PLACES } from '../../constants/time';


/**
 * 将原始 FFLogs 事件转换为时间轴所需格式
 */
export class FFLogsProcessor {
    /**
     * 过滤并映射友方施法事件
     */
    static processFriendlyEvents(
        rawEvents: FFlogsApiV1ReportEvents[],
        startTime: number,
        allowedActionIds: Set<number>
    ): FFlogsStance {
        const processed: FFlogsStance = [];

        for (const event of rawEvents) {
            if (!event.ability) continue;

            // 仅保留施法事件
            if (event.type !== 'cast' && event.type !== 'begincast') continue;

            const actionId = event.ability.guid;

            // 仅保留技能表内的事件
            if (!allowedActionIds.has(actionId)) continue;

            processed.push({
                time: Number(((event.timestamp - startTime) / MS_PER_SEC).toFixed(TIME_DECIMAL_PLACES)),
                type: event.type,
                actionName: event.ability.name,
                actionId: actionId,
                sourceIsFriendly: true,
                url: event.ability.abilityIcon?.replace('-', '/').replace('.png', '') ?? '',
                sourceID: event.sourceID,
                duration: event.duration
            });
        }

        return processed.sort((a, b) => a.time - b.time);
    }

    /**
     * 处理敌方施法事件
     */
    static processEnemyEvents(
        rawEvents: FFlogsApiV1ReportEvents[],
        startTime: number
    ): FFlogsStance {
        const processed: FFlogsStance = [];

        for (const event of rawEvents) {
            if (!event.ability) continue;

            // 仅保留施法事件
            if (event.type !== 'cast' && event.type !== 'begincast') continue;

            // 保留全部可疑施法，由导出逻辑筛选

            processed.push({
                time: Number(((event.timestamp - startTime) / MS_PER_SEC).toFixed(TIME_DECIMAL_PLACES)),
                type: event.type,
                actionName: event.ability.name,
                actionId: event.ability.guid,
                sourceIsFriendly: false,
                url: '',
                sourceID: event.sourceID,
                duration: event.duration
            });
        }

        return processed.sort((a, b) => a.time - b.time);
    }
}
