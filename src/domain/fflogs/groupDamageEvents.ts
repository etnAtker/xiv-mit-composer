import type {
  DamageEventsByPlayerId,
  GroupedDamageEvent,
  GroupedDamageHit,
  PartyMember,
} from '../../model/types';

export const DAMAGE_GROUP_WINDOW_MS = 100;

interface DamageWithOwner extends GroupedDamageHit {
  abilityGuid: number;
}

const toComparableDamage = (amount: number) =>
  Number.isFinite(amount) ? amount : Number.NEGATIVE_INFINITY;

const resolveDisplayAmount = (hits: DamageWithOwner[]) => {
  const maxAmount = Math.max(...hits.map((hit) => toComparableDamage(hit.unmitigatedAmount)));
  return maxAmount === Number.NEGATIVE_INFINITY ? Number.NaN : maxAmount;
};

export function groupDamageEvents(
  damageEventsByPlayerId: DamageEventsByPlayerId,
  partyMembers: PartyMember[],
): GroupedDamageEvent[] {
  const memberMap = new Map(partyMembers.map((member) => [member.playerId, member]));
  const buckets = new Map<number, DamageWithOwner[]>();

  Object.entries(damageEventsByPlayerId).forEach(([rawPlayerId, events]) => {
    const playerId = Number(rawPlayerId);
    const member = memberMap.get(playerId);
    if (!member) return;

    events.forEach((event) => {
      const hit: DamageWithOwner = {
        playerId,
        playerName: member.name,
        job: member.job,
        tMs: event.tMs,
        amount: event.amount,
        unmitigatedAmount: event.unmitigatedAmount,
        originalEvent: event,
        abilityGuid: event.ability.guid,
      };
      const bucket = buckets.get(event.ability.guid) ?? [];
      bucket.push(hit);
      buckets.set(event.ability.guid, bucket);
    });
  });

  const grouped: GroupedDamageEvent[] = [];

  for (const [abilityGuid, hits] of buckets) {
    const sortedHits = hits.slice().sort((a, b) => a.tMs - b.tMs || a.playerId - b.playerId);
    let currentGroup: DamageWithOwner[] = [];
    let groupStartMs = 0;

    const flushGroup = () => {
      if (!currentGroup.length) return;
      const sortedGroup = currentGroup
        .slice()
        .sort((a, b) => a.tMs - b.tMs || a.playerId - b.playerId);
      const tMs = sortedGroup[0].tMs;
      const playerKey = sortedGroup.map((hit) => hit.playerId).join('-');
      grouped.push({
        id: `${abilityGuid}:${tMs}:${playerKey}`,
        tMs,
        ability: sortedGroup[0].originalEvent.ability,
        displayAmount: resolveDisplayAmount(sortedGroup),
        hits: sortedGroup.map((hit) => ({
          playerId: hit.playerId,
          playerName: hit.playerName,
          job: hit.job,
          tMs: hit.tMs,
          amount: hit.amount,
          unmitigatedAmount: hit.unmitigatedAmount,
          originalEvent: hit.originalEvent,
        })),
      });
    };

    for (const hit of sortedHits) {
      if (!currentGroup.length) {
        currentGroup = [hit];
        groupStartMs = hit.tMs;
        continue;
      }

      if (hit.tMs - groupStartMs < DAMAGE_GROUP_WINDOW_MS) {
        currentGroup.push(hit);
      } else {
        flushGroup();
        currentGroup = [hit];
        groupStartMs = hit.tMs;
      }
    }

    flushGroup();
  }

  return grouped.sort((a, b) => a.tMs - b.tMs || a.ability.guid - b.ability.guid);
}
