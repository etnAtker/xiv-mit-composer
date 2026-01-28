import type { DamageEvent } from '../../model/types';

export function mergeDamageEvents(damages: DamageEvent[], fightStart: number): DamageEvent[] {
  const processTimestamp = (e: DamageEvent): DamageEvent => ({
    ...e,
    tMs: e.timestamp - fightStart,
  });
  const dict = new Map<number, { calc?: DamageEvent; dmg?: DamageEvent }>();
  const standaloneEvents: DamageEvent[] = [];

  damages.forEach((e) => {
    const pid = e.packetID;
    if (pid) {
      if (!dict.has(pid)) dict.set(pid, {});
      const entry = dict.get(pid)!;

      if (e.type === 'calculateddamage') {
        entry.calc = e;
      } else {
        entry.dmg = e;
      }
    } else {
      if (e.type === 'calculateddamage') {
        standaloneEvents.push({
          ...e,
          ability: { ...e.ability, name: `? ${e.ability.name}` },
        });
      } else {
        standaloneEvents.push(e);
      }
    }
  });

  const combinedDamages: DamageEvent[] = [];

  for (const { calc, dmg } of dict.values()) {
    if (calc && dmg) {
      combinedDamages.push({
        ...dmg,
        timestamp: calc.timestamp,
        packetID: calc.packetID,
        type: 'damage-combined',
      });
    } else if (calc) {
      combinedDamages.push({
        ...calc,
        ability: { ...calc.ability, name: `? ${calc.ability.name}` },
      });
    } else if (dmg) {
      combinedDamages.push({
        ...dmg,
        ability: { ...dmg.ability, name: `* ${dmg.ability.name}` },
      });
    }
  }

  const finalDamages = [...standaloneEvents, ...combinedDamages].sort(
    (a, b) => a.timestamp - b.timestamp,
  );

  return finalDamages.map(processTimestamp);
}
