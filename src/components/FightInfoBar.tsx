import type { Fight, PartyMember } from '../model/types';
import { MS_PER_SEC, TIME_DECIMAL_PLACES } from '../constants/time';
import { XivIcon } from './XivIcon';
import { JOB_ICON_LOCAL_SRC } from '../data/icons';

interface Props {
  fight: Fight;
  partyMembers: PartyMember[];
  onEditParty: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

export function FightInfoBar({
  fight,
  partyMembers,
  onEditParty,
  onExpandAll,
  onCollapseAll,
}: Props) {
  return (
    <div className="px-6 py-3 bg-surface-2 border-b border-app flex gap-6 items-center flex-wrap z-10 relative shadow-sm">
      <div className="flex items-center gap-2">
        <span className="text-muted text-xs font-bold uppercase tracking-wider">战斗</span>
        <span className="font-semibold text-app">{fight.name}</span>
        <span className="text-xs text-muted bg-surface-3 px-1.5 py-0.5 rounded">
          {(fight.durationMs / MS_PER_SEC).toFixed(TIME_DECIMAL_PLACES)}s
        </span>
      </div>

      <div className="w-px h-6 bg-(--color-border)" />

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="text-muted text-xs font-bold uppercase tracking-wider">队伍</span>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {partyMembers.length === 0 ? (
            <span className="text-xs text-muted">未选择玩家</span>
          ) : (
            partyMembers.map((member) => (
              <div
                key={member.playerId}
                className="flex max-w-48 items-center gap-1.5 rounded border border-app bg-surface-3 px-2 py-1 text-xs"
                title={`${member.name} (${member.job})`}
              >
                <XivIcon
                  localSrc={JOB_ICON_LOCAL_SRC[member.job]}
                  alt={`${member.job} icon`}
                  className="h-4 w-4 shrink-0 object-contain"
                />
                <span className="truncate">{member.name}</span>
                <span className="font-mono text-[10px] text-muted">{member.job}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded border border-app bg-surface px-3 py-1 text-[11px] text-muted hover:text-app"
          onClick={onExpandAll}
        >
          全部展开
        </button>
        <button
          type="button"
          className="rounded border border-app bg-surface px-3 py-1 text-[11px] text-muted hover:text-app"
          onClick={onCollapseAll}
        >
          全部折叠
        </button>
        <button
          type="button"
          className="rounded border border-(--color-accent-strong) bg-accent-strong px-3 py-1 text-[11px] font-semibold text-white hover:bg-accent"
          onClick={onEditParty}
        >
          调整队伍
        </button>
      </div>
    </div>
  );
}
