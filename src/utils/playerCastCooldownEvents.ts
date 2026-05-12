import { COOLDOWN_GROUP_MAP, getSkillDefinition, normalizeSkillId } from '../data/skills';
import type { CooldownEvent } from '../model/types';
import {
  GROUP_PREFIX,
  OPEN_ENDED_COOLDOWN_END_MS,
  type BuildMode,
  type CooldownEventBoundary,
  handleBuildFailure,
  stripGroupPrefix,
} from './playerCastShared';

export function buildCooldownEvents(
  boundaries: Map<string, CooldownEventBoundary[]>,
  mode: BuildMode,
): CooldownEvent[] {
  const cooldowns: CooldownEvent[] = [];

  for (const bs of boundaries.values()) {
    if (!bs.length) continue;
    const skillId = bs[0].skillId;
    cooldowns.push(...buildCooldownEventsSingle(skillId, bs, mode));
  }

  return cooldowns;
}

function buildCooldownEventsSingle(
  skillId: string,
  boundaries: CooldownEventBoundary[],
  mode: BuildMode,
): CooldownEvent[] {
  const skill = getSkillDefinition(skillId);
  if (!skill) {
    handleBuildFailure(mode, 'UNKNOWN_SKILL', `致命错误：技能 ${normalizeSkillId(skillId)} 不存在`);
    return [];
  }

  const cooldowns: CooldownEvent[] = [];
  const ownerKey = boundaries[0]?.ownerKey;
  const ownerJob = boundaries[0]?.ownerJob;

  boundaries.sort((a, b) => a.tMs - b.tMs);

  let lastCooldown: CooldownEvent | undefined;
  let unusableOpenCount = 0;
  let cooldownOpenCount = 0;

  const closeLastCooldown = (tMs: number) => {
    if (lastCooldown === undefined) {
      handleBuildFailure(mode, 'MISSING_OPEN_COOLDOWN', '错误：没有找到未闭合的cooldown。');
      return;
    }
    lastCooldown.tEndMs = tMs;
    lastCooldown.durationMs = lastCooldown.tEndMs - lastCooldown.tStartMs;
    cooldowns.push(lastCooldown);
    lastCooldown = undefined;
  };

  const startNewCooldown = (type: CooldownEvent['cdType'], tMs: number) => {
    if (lastCooldown) {
      handleBuildFailure(mode, 'DUPLICATE_OPEN_COOLDOWN', '错误：有未闭合的cooldown。');
      return;
    }
    lastCooldown = {
      eventType: 'cooldown',
      cdType: type,
      skillId,
      ownerJob,
      ownerKey,
      tStartMs: tMs,
      durationMs: 0,
      tEndMs: 0,
    };
  };

  for (const boundary of boundaries) {
    switch (boundary.boundaryType) {
      case 'unusedStart':
        if (unusableOpenCount === 0 && cooldownOpenCount === 0) {
          startNewCooldown('unusable', boundary.tMs);
        }
        unusableOpenCount++;
        break;
      case 'unusedEnd':
        unusableOpenCount--;
        if (unusableOpenCount === 0 && cooldownOpenCount === 0) {
          closeLastCooldown(boundary.tMs);
        }
        break;
      case 'cooldownStart':
        if (cooldownOpenCount === 0 && unusableOpenCount !== 0) {
          closeLastCooldown(boundary.tMs);
        }

        if (cooldownOpenCount === 0) {
          startNewCooldown('cooldown', boundary.tMs);
        }
        cooldownOpenCount++;
        break;
      case 'cooldownEnd':
        cooldownOpenCount--;
        if (cooldownOpenCount === 0) {
          closeLastCooldown(boundary.tMs);

          if (unusableOpenCount !== 0) {
            startNewCooldown('unusable', boundary.tMs);
          }
        }
        break;
    }
  }

  if (lastCooldown && cooldownOpenCount > 0 && canLeaveCooldownOpen(boundaries)) {
    closeLastCooldown(OPEN_ENDED_COOLDOWN_END_MS);
    cooldownOpenCount = 0;
  }

  if (lastCooldown || unusableOpenCount !== 0 || cooldownOpenCount !== 0) {
    handleBuildFailure(mode, 'UNCLOSED_COOLDOWN', `错误：技能 ${skillId} 存在未闭合的冷却区间。`);
  }

  return cooldowns;
}

function canLeaveCooldownOpen(boundaries: CooldownEventBoundary[]) {
  return boundaries.some((boundary) => {
    if (!boundary.resourceId.startsWith(GROUP_PREFIX)) return false;
    const cooldownGroupMeta = COOLDOWN_GROUP_MAP.get(stripGroupPrefix(boundary.resourceId));
    return !cooldownGroupMeta?.recovery;
  });
}
