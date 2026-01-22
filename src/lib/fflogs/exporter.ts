// 修改自 https://github.com/Souma-Sumire/ff14-overlay-vue/blob/main/src/components/timeline/FflogsImport.vue

import { getFactoryRule } from './compat/timelineSpecialRules';

interface ExportableEvent {
  time: number;
  actionName: string;
  actionId: number; // 原始 Action ID
  tts: string;
  type: string; // 'cast' 或 'begincast'
  isFriendly: boolean;
  sourceId?: number;
}

export class FFLogsExporter {
  /**
   * 生成时间轴文本内容
   * 根据 Action ID 重新应用 window/sync 规则
   * @param events 事件列表
   * @param enableTTS 是否生成 TTS（默认为 false）
   */
  static generateTimeline(events: ExportableEvent[], enableTTS: boolean = false): string {
    const lines: string[] = [];
    const battleSyncedIds = new Set<number>();

    for (const event of events) {
      if (event.isFriendly) {
        // 玩家技能
        if (enableTTS) {
          lines.push(`${event.time} "<${event.actionName}>~" tts "${event.tts}"`);
        } else {
          lines.push(`${event.time} "<${event.actionName}>~"`);
        }
      } else {
        // Boss 技能
        const rule = getFactoryRule(event.actionId);

        const isAttack = /^(?:攻击|attack|攻撃)$/i.test(event.actionName);

        // 忽略没有规则的通用攻击
        if ((isAttack || (event.type === 'cast' && !rule)) && !rule) {
          lines.push(`# ${event.time} "${event.actionName}"`);
          continue;
        }

        // 构造导出行
        const hexId = event.actionId.toString(16).toUpperCase();
        const regexType = event.type === 'begincast' ? 'StartsUsing' : 'Ability';
        const coreLine = `${event.time} "${event.actionName}" ${regexType} { id: "${hexId}" }`;

        if (rule) {
          // 应用同步规则
          const { window, syncOnce, battleOnce } = rule;

          if (battleOnce) {
            if (battleSyncedIds.has(event.actionId)) {
              // 同一战斗仅同步一次的事件改为注释
              lines.push(`# ${event.time} "${event.actionName}"`);
              continue;
            }
            battleSyncedIds.add(event.actionId);
          }

          const syncStr = syncOnce ? ' once' : '';
          lines.push(`${coreLine} window ${window[0]},${window[1]}${syncStr}`);
        } else {
          // 无规则且非通用攻击时改为注释
          lines.push(`# ${coreLine}`);
        }
      }
    }

    return lines.join('\n');
  }
}
