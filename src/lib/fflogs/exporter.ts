import { getFactoryRule } from './compat/timelineSpecialRules';

interface ExportableEvent {
    time: number;
    actionName: string;
    actionId: number; // 原始 ActionID
    type: string;     // 'cast' 或 'begincast'
    isFriendly: boolean;
    sourceId?: number;
}

export class FFLogsExporter {
    /**
     * 生成时间轴文本内容
     * 根据 ActionID 重新应用 window 和 sync 逻辑
     */
    static generateTimeline(events: ExportableEvent[]): string {
        const lines: string[] = [];
        const battleSyncedIds = new Set<number>();

        for (const event of events) {
            if (event.isFriendly) {
                // 玩家技能格式
                lines.push(`${event.time} "<${event.actionName}>~"`);
            } else {
                // Boss 技能逻辑
                const rule = getFactoryRule(event.actionId);

                const isAttack = /^(?:攻击|attack|攻撃)$/i.test(event.actionName);


                // 忽略没有特殊规则的通用攻击
                if ((isAttack || (event.type === 'cast' && !rule)) && !rule) {
                    lines.push(`# ${event.time} "${event.actionName}"`);
                    continue;
                }

                // 准备字符串部分
                const hexId = event.actionId.toString(16).toUpperCase();
                const regexType = event.type === 'begincast' ? 'StartsUsing' : 'Ability';
                const coreLine = `${event.time} "${event.actionName}" ${regexType} { id: "${hexId}" }`;

                if (rule) {
                    // 应用同步规则
                    const { window, syncOnce, battleOnce } = rule;

                    if (battleOnce) {
                        if (battleSyncedIds.has(event.actionId)) {
                            // 如果已在本次战斗中同步过，作为注释输出
                            lines.push(`# ${event.time} "${event.actionName}"`);
                            continue;
                        }
                        battleSyncedIds.add(event.actionId);
                    }

                    const syncStr = syncOnce ? ' once' : '';
                    lines.push(`${coreLine} window ${window[0]},${window[1]}${syncStr}`);
                } else {
                    // 无规则且不是通用攻击，作为注释输出
                    lines.push(`# ${coreLine}`);
                }
            }
        }

        return lines.join('\n');
    }
}
