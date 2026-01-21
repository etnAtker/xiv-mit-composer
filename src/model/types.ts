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
  color: string;
  actionId: number; // FFLogs 技能 ID
  icon?: string;
  cooldownGroup?: string; // 共享CD组 ID，在自己进入cd的同时会消耗冷却组的一层cd
}

export interface CooldownGroup {
  id: string;
  cooldownSec: number;
  stack: number;
}

export type PlayerEvent = MitEvent | CooldownEvent;
export type PlayerEventType = 'mit' | 'cooldown';

export interface MitEvent {
  eventType: PlayerEventType;
  id: string; // UUID
  skillId: string;
  tStartMs: number;
  durationMs: number;
  tEndMs: number;
}

export interface CooldownEvent {
  eventType: PlayerEventType;
  // cooldown - 冷却
  // unusable - 由于某技能使用，在该时间点之前无法额外使用一次
  cdType: 'cooldown' | 'unusable';
  skillId: string;
  tStartMs: number;
  durationMs: number;
  tEndMs: number;
}

export function isMitEvent(event: PlayerEvent): event is MitEvent {
  return event.eventType === 'mit';
}

export function isCooldownEvent(event: PlayerEvent): event is CooldownEvent {
  return event.eventType === 'cooldown';
}

// API 响应结构（简化版）
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
  // FFLogs 导出字段
  originalActionId?: number;
  isBossEvent?: boolean;
  isFriendly?: boolean;
  originalType?: 'cast' | 'begincast';
  abilityIcon?: string;
}
