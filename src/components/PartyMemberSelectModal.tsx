import { useMemo, useState } from 'react';
import type { Actor, PartyMember } from '../model/types';
import { resolveActorJob } from '../model/jobs';
import { XivIcon } from './XivIcon';
import { JOB_ICON_LOCAL_SRC } from '../data/icons';

interface Props {
  isOpen: boolean;
  actors: Actor[];
  initialMembers: PartyMember[];
  onConfirm: (members: PartyMember[]) => void;
  onClose: () => void;
}

const MAX_PARTY_MEMBERS = 8;

export function PartyMemberSelectModal({
  isOpen,
  actors,
  initialMembers,
  onConfirm,
  onClose,
}: Props) {
  const selectableActors = useMemo(
    () =>
      actors
        .map((actor) => ({ actor, job: resolveActorJob(actor) }))
        .filter((entry): entry is { actor: Actor; job: PartyMember['job'] } => !!entry.job),
    [actors],
  );

  const [selectedMembers, setSelectedMembers] = useState<PartyMember[]>(() =>
    initialMembers.slice(0, MAX_PARTY_MEMBERS),
  );
  const selectedIds = new Set(selectedMembers.map((member) => member.playerId));

  if (!isOpen) return null;

  const moveMember = (playerId: number, delta: -1 | 1) => {
    setSelectedMembers((prev) => {
      const index = prev.findIndex((member) => member.playerId === playerId);
      const nextIndex = index + delta;
      if (index < 0 || nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = prev.slice();
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  };

  const addActor = (actor: Actor, job: PartyMember['job']) => {
    if (selectedIds.has(actor.id) || selectedMembers.length >= MAX_PARTY_MEMBERS) return;
    setSelectedMembers((prev) => [
      ...prev,
      {
        playerId: actor.id,
        name: actor.name,
        job,
        collapsed: false,
      },
    ]);
  };

  return (
    <div className="fixed inset-0 z-9999 flex items-center justify-center bg-black/60 p-4">
      <div className="flex h-[78vh] w-full max-w-4xl flex-col rounded-lg border border-app bg-surface-3 text-app shadow-2xl">
        <div className="border-b border-app px-5 py-3">
          <div className="text-sm font-semibold text-app">选择队伍成员</div>
          <div className="mt-1 text-[11px] text-muted font-mono">
            最多选择 {MAX_PARTY_MEMBERS} 人，顺序会用于时间轴列组。
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-2 gap-0">
          <div className="min-h-0 border-r border-app p-4">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
              可选玩家
            </div>
            <div className="h-full space-y-2 overflow-y-auto pr-1 custom-scrollbar">
              {selectableActors.map(({ actor, job }) => {
                const selected = selectedIds.has(actor.id);
                return (
                  <button
                    key={actor.id}
                    type="button"
                    disabled={selected || selectedMembers.length >= MAX_PARTY_MEMBERS}
                    onClick={() => addActor(actor, job)}
                    className="flex w-full items-center justify-between gap-3 rounded border border-app bg-surface p-2 text-left text-sm hover:border-(--color-accent) disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <XivIcon
                        localSrc={JOB_ICON_LOCAL_SRC[job]}
                        alt={`${job} icon`}
                        className="h-5 w-5 shrink-0 object-contain"
                      />
                      <span className="truncate font-medium">{actor.name}</span>
                    </div>
                    <span className="font-mono text-[10px] text-muted">{job}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-h-0 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-muted">已选玩家</span>
              <span className="font-mono text-[10px] text-muted">
                {selectedMembers.length}/{MAX_PARTY_MEMBERS}
              </span>
            </div>
            <div className="h-full space-y-2 overflow-y-auto pr-1 custom-scrollbar">
              {selectedMembers.length === 0 && (
                <div className="rounded border border-dashed border-app p-4 text-center text-xs text-muted">
                  从左侧选择玩家
                </div>
              )}
              {selectedMembers.map((member, index) => (
                <div
                  key={member.playerId}
                  className="flex items-center gap-2 rounded border border-app bg-surface p-2 text-sm"
                >
                  <span className="w-5 shrink-0 text-right font-mono text-[10px] text-muted">
                    {index + 1}
                  </span>
                  <XivIcon
                    localSrc={JOB_ICON_LOCAL_SRC[member.job]}
                    alt={`${member.job} icon`}
                    className="h-5 w-5 shrink-0 object-contain"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{member.name}</div>
                    <div className="font-mono text-[10px] text-muted">{member.job}</div>
                  </div>
                  <button
                    type="button"
                    className="rounded border border-app px-2 py-1 text-[10px] text-muted hover:text-app disabled:opacity-40"
                    disabled={index === 0}
                    onClick={() => moveMember(member.playerId, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="rounded border border-app px-2 py-1 text-[10px] text-muted hover:text-app disabled:opacity-40"
                    disabled={index === selectedMembers.length - 1}
                    onClick={() => moveMember(member.playerId, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="rounded border border-red-500/40 px-2 py-1 text-[10px] text-red-300 hover:bg-red-500/10"
                    onClick={() =>
                      setSelectedMembers((prev) =>
                        prev.filter((item) => item.playerId !== member.playerId),
                      )
                    }
                  >
                    移除
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-app px-5 py-3">
          <button
            type="button"
            className="rounded border border-app bg-surface px-3 py-1 text-[11px] text-muted hover:text-app"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="rounded border border-(--color-accent-strong) bg-accent-strong px-3 py-1 text-[11px] font-semibold text-white hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            disabled={selectedMembers.length === 0}
            onClick={() => onConfirm(selectedMembers)}
          >
            加载所选玩家
          </button>
        </div>
      </div>
    </div>
  );
}
