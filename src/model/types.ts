export type Job =
  | 'PLD'
  | 'WAR'
  | 'DRK'
  | 'GNB'
  | 'WHM'
  | 'SCH'
  | 'AST'
  | 'SGE'
  | 'MNK'
  | 'DRG'
  | 'NIN'
  | 'SAM'
  | 'RPR'
  | 'VPR'
  | 'BRD'
  | 'MCH'
  | 'DNC'
  | 'BLM'
  | 'SMN'
  | 'RDM'
  | 'PCT';

export type MitigationDamageType = 'all' | 'physical' | 'magical';
export type MitigationTarget = 'boss' | 'player';

export type SkillMitigationTargeting =
  | {
      kind: 'self';
    }
  | {
      kind: 'party';
    }
  | {
      kind: 'ally';
      maxTargets: number;
      canTargetSelf?: boolean;
    }
  | {
      kind: 'enemy';
      maxTargets: number;
    }
  | {
      kind: 'enemies';
    };

export type SkillMitigation =
  | {
      kind: 'damage-down';
      target: MitigationTarget;
      pct: number;
      durationSec: number;
      damageType: MitigationDamageType;
      targeting: SkillMitigationTargeting;
    }
  | {
      kind: 'shield';
      durationSec: number;
      potency?: number;
      maxHpPct?: number;
      healingPct?: number;
      targeting: SkillMitigationTargeting;
    }
  | {
      kind: 'hot';
      durationSec: number;
      potency: number;
      targeting: SkillMitigationTargeting;
    };

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

export interface SkillI18n {
  name_jp: string;
  name_en: string;
  name_fr: string;
  name_de: string;
}

export interface Skill {
  id: string;
  name: string;
  name_jp: string;
  name_en: string;
  name_fr: string;
  name_de: string;
  cooldownSec: number;
  durationSec: number;
  job: Job | 'ALL';
  color: string;
  actionId: number; // FFLogs 技能 ID
  icon?: string;
  mitigation?: SkillMitigation[];
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
  ownerId?: number;
  ownerJob?: Job;
}

export interface CooldownEvent {
  eventType: PlayerEventType;
  // cooldown - 冷却
  // unusable - 由于某技能使用，在该时间点之前无法额外使用一次
  cdType: 'cooldown' | 'unusable';
  skillId: string;
  ownerKey?: string;
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
