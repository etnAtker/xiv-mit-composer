import type { FFlogsApiV1ReportEvents, FFlogsStance } from './compat/types';


/**
 * 负责将原始 FFLogs 事件转换为规范格式的处理器
 * 适用于时间轴编辑器。
 */
export class FFLogsProcessor {
    /**
     * 过滤并映射友方事件。
     * - 忽略伤害事件 (根据需求)。
     * - 根据 "固定技能" (FixedSkillMapper) 白名单进行过滤。
     */
    static processFriendlyEvents(
        rawEvents: FFlogsApiV1ReportEvents[],
        startTime: number,
        allowedActionIds: Set<number>
    ): FFlogsStance {
        const processed: FFlogsStance = [];

        for (const event of rawEvents) {
            if (!event.ability) continue;

            // 仅处理 cast 或 begincast 类型
            if (event.type !== 'cast' && event.type !== 'begincast') continue;

            const actionId = event.ability.guid;

            // 过滤:必须在固定技能列表中
            if (!allowedActionIds.has(actionId)) continue;

            processed.push({
                time: Number(((event.timestamp - startTime) / 1000).toFixed(1)),
                type: event.type,
                actionName: event.ability.name, // 可以在这里使用翻译映射
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
     * 处理敌方事件。
     * - 忽略自动攻击和不相关的机制，逻辑迁移自 ff14-overlay-vue。
     */
    static processEnemyEvents(
        rawEvents: FFlogsApiV1ReportEvents[],
        startTime: number
    ): FFlogsStance {
        const processed: FFlogsStance = [];

        for (const event of rawEvents) {
            if (!event.ability) continue;

            // 过滤: 忽略伤害和死亡等非施法事件
            if (event.type !== 'cast' && event.type !== 'begincast') continue;

            // 填充所有可能相关的事件，由导出逻辑决定是否显示

            processed.push({
                time: Number(((event.timestamp - startTime) / 1000).toFixed(1)),
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
