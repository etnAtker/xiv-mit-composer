export type Job = 'PLD' | 'WAR' | 'DRK' | 'GNB';

export interface Fight {
    id: number;
    start: number;
    end: number;
    durationMs: number;
    name: string;
}

export interface Actor {
    id: number;
    name: string;
    type: string;
    subType: string;
}

export interface Skill {
    id: string;
    name: string;
    cooldownSec: number;
    durationSec: number;
    job: Job | 'ALL';
    icon?: string;
    color?: string;
    actionId?: number; // FFLogs 技能 ID
}

export interface MitEvent {
    id: string; // UUID
    skillId: string;
    tStartMs: number;
    durationMs: number;
    // 辅助字段
    tEndMs: number;
}

// API 响应结构 (简化版)
export interface FFLogsAbility {
    name: string;
    guid: number;
    type: number;
}

export interface DamageEvent {
    timestamp: number;
    type: string; // 类型：'damage-taken' 或 'calculateddamage'
    sourceID: number;
    targetID: number;
    ability: FFLogsAbility;
    amount: number;
    unmitigatedAmount: number;
    packetID?: number;
    // 计算字段
    tMs: number;
}

export interface CastEvent {
    timestamp: number;
    type: string; // 类型：'cast' 或 'begincast'
    sourceID: number;
    targetID: number;
    ability: FFLogsAbility;
    duration?: number;
    // 计算字段
    tMs: number;
    // FFLogs 导出元数据
    originalActionId?: number;
    isBossEvent?: boolean;
    isFriendly?: boolean;
    originalType?: 'cast' | 'begincast';
    abilityIcon?: string;
}
