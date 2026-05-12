import { MS_PER_SEC } from '../constants/time';
import { COOLDOWN_GROUP_MAP } from '../data/skills';
import type { CooldownEvent, Job, MitEvent, ResourceEvent } from '../model/types';

export const GROUP_PREFIX = 'grp:';
export const OPEN_ENDED_COOLDOWN_END_MS = Number.MAX_SAFE_INTEGER;
export const COOLDOWN_TOLERANCE_SEC = 0.3;

export type BuildMode = 'strict' | 'tolerant';

export interface CooldownBuildFailure {
  ok: false;
  code:
    | 'UNKNOWN_SKILL'
    | 'UNKNOWN_GROUP'
    | 'NEGATIVE_STACK'
    | 'MISSING_OPEN_COOLDOWN'
    | 'DUPLICATE_OPEN_COOLDOWN'
    | 'UNCLOSED_COOLDOWN';
  message: string;
}

export interface CooldownBuildSuccess {
  ok: true;
  cooldownEvents: CooldownEvent[];
  resourceEvents: ResourceEvent[];
}

export type CooldownBuildResult = CooldownBuildSuccess | CooldownBuildFailure;

export type MitigationStateFailure = CooldownBuildFailure;

export interface MitigationStateSuccess {
  ok: true;
  mitEvents: MitEvent[];
  cooldownEvents: CooldownEvent[];
  resourceEvents: ResourceEvent[];
}

export type MitigationStateResult = MitigationStateSuccess | MitigationStateFailure;

export interface PlayerCastState {
  cooldownEvents: CooldownEvent[];
  resourceEvents: ResourceEvent[];
}

export interface StackEvent {
  resourceKey: string;
  ownerKey?: string;
  ownerJob?: Job;
  skillId: string;
  isGroup: boolean;
  type: 'consume' | 'autoRecover' | 'skillRecover' | 'expire';
  amount: number;
  cooldownMs: number;
  tMs: number;
}

export interface CooldownEventBoundary {
  skillId: string;
  resourceId: string;
  ownerKey?: string;
  ownerJob?: Job;
  tMs: number;
  boundaryType: 'unusedStart' | 'unusedEnd' | 'cooldownStart' | 'cooldownEnd';
}

export interface ConstraintInterval {
  cdType: CooldownEvent['cdType'];
  resourceId: string;
  ownerKey?: string;
  ownerJob?: Job;
  tStartMs: number;
  tEndMs: number;
}

export interface StackInterval {
  resourceId: string;
  ownerKey?: string;
  ownerJob?: Job;
  value: number;
  tStartMs: number;
  tEndMs: number;
}

export interface ReservationInterval {
  resourceId: string;
  ownerKey?: string;
  ownerJob?: Job;
  futureSkillId: string;
  futureGroupIds: string[];
  tStartMs: number;
  tEndMs: number;
}

export interface ResourceState {
  resourceGroupId: string;
  ownerKey?: string;
  ownerJob?: Job;
  value: number;
  maxValue: number;
  startMs: number;
}

export class CooldownBuildError extends Error {
  code: CooldownBuildFailure['code'];

  constructor(code: CooldownBuildFailure['code'], message: string) {
    super(message);
    this.name = 'CooldownBuildError';
    this.code = code;
  }
}

export const buildOwnerKey = (ownerId?: number, ownerJob?: Job) => {
  if (typeof ownerId === 'number') return `id:${ownerId}`;
  if (ownerJob) return `job:${ownerJob}`;
  return undefined;
};

export function sortMitEvents<T extends { tStartMs: number }>(events: T[]) {
  return [...events].sort((a, b) => a.tStartMs - b.tStartMs);
}

export function handleBuildFailure(
  mode: BuildMode,
  code: CooldownBuildFailure['code'],
  message: string,
): never | void {
  if (mode === 'strict') {
    throw new CooldownBuildError(code, message);
  }
  console.error(message);
}

export function toGroupResourceId(groupId: string): string {
  return `${GROUP_PREFIX}${groupId}`;
}

export function toOwnedGroupResourceKey(groupId: string, ownerKey?: string): string {
  const groupResourceId = toGroupResourceId(groupId);
  return ownerKey ? `${groupResourceId}:${ownerKey}` : groupResourceId;
}

export function stripGroupPrefix(resourceId: string): string {
  const raw = resourceId.startsWith(GROUP_PREFIX)
    ? resourceId.slice(GROUP_PREFIX.length)
    : resourceId;
  return raw.split(':')[0];
}

export function getInitialStack(stackEvent: StackEvent): number {
  if (!stackEvent.isGroup) return 1;

  const cooldownGroupMeta = COOLDOWN_GROUP_MAP.get(stripGroupPrefix(stackEvent.resourceKey));
  return getGroupInitialStack(cooldownGroupMeta);
}

export function getMaxStack(stackEvent: StackEvent): number {
  if (!stackEvent.isGroup) return 1;

  const cooldownGroupMeta = COOLDOWN_GROUP_MAP.get(stripGroupPrefix(stackEvent.resourceKey));
  return cooldownGroupMeta?.stack ?? 1;
}

export function getGroupInitialStack(
  cooldownGroupMeta: { stack: number; initialStack?: number } | undefined,
) {
  const maxStack = cooldownGroupMeta?.stack ?? 1;
  const configuredInitialStack = cooldownGroupMeta?.initialStack ?? maxStack;
  return Math.min(Math.max(configuredInitialStack, 0), maxStack);
}

export function normalizeCooldownGroupIds(cooldownGroup: string | string[] | undefined): string[] {
  if (!cooldownGroup) return [];
  return Array.isArray(cooldownGroup) ? cooldownGroup : [cooldownGroup];
}

export function toEffectiveCooldownMs(cooldownSec: number | undefined): number {
  return Math.max(0, Math.round(((cooldownSec ?? 0) - COOLDOWN_TOLERANCE_SEC) * MS_PER_SEC));
}
