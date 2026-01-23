import type { Actor, Fight, Job } from '../model/types';
import { cn } from '../utils';
import { MS_PER_SEC, TIME_DECIMAL_PLACES } from '../constants/time';

interface Props {
  fight: Fight;
  actors: Actor[];
  mode: 'single' | 'dual';
  selectedJob: Job | null;
  selectedJobs: Job[];
  selectedPlayerId: number | null;
  selectedPlayersByJob: Record<Job, number | null>;
  onSelectJob: (job: Job) => void;
  onToggleJob: (job: Job) => void;
  onSelectPlayer: (id: number) => void;
  onSelectPlayerForJob: (job: Job, id: number) => void;
}

const JOBS: Job[] = ['PLD', 'WAR', 'DRK', 'GNB'];

export function FightInfoBar({
  fight,
  actors,
  mode,
  selectedJob,
  selectedJobs,
  selectedPlayerId,
  selectedPlayersByJob,
  onSelectJob,
  onToggleJob,
  onSelectPlayer,
  onSelectPlayerForJob,
}: Props) {
  const maxJobs = mode === 'dual' ? 2 : 1;
  const jobTypeMap: Record<Job, string[]> = {
    PLD: ['Paladin'],
    WAR: ['Warrior'],
    DRK: ['DarkKnight', 'Dark Knight'],
    GNB: ['Gunbreaker'],
  };
  const filteredActors = (job: Job | null) =>
    actors.filter((actor) => {
      if (!job) return true;
      return jobTypeMap[job]?.includes(actor.type) || jobTypeMap[job]?.includes(actor.subType);
    });

  return (
    <div className="px-6 py-3 bg-surface-2 border-b border-app flex gap-6 items-center flex-wrap z-10 relative shadow-sm">
      <div className="flex items-center gap-2">
        <span className="text-muted text-xs font-bold uppercase tracking-wider">战斗</span>
        <span className="font-semibold text-app">{fight.name}</span>
        <span className="text-xs text-muted bg-surface-3 px-1.5 py-0.5 rounded">
          {(fight.durationMs / MS_PER_SEC).toFixed(TIME_DECIMAL_PLACES)}s
        </span>
      </div>

      <div className="w-[1px] h-6 bg-[var(--color-border)]"></div>

      <div className="flex items-center gap-3">
        <span className="text-muted text-xs font-bold uppercase tracking-wider">职业</span>
        <div className="flex bg-surface-3 rounded-lg p-1 gap-1 border border-app">
          {JOBS.map((job) => (
            <button
              key={job}
              type="button"
              onClick={() => {
                if (mode === 'dual') {
                  if (!selectedJobs.includes(job) && selectedJobs.length >= maxJobs) return;
                  onToggleJob(job);
                } else {
                  onSelectJob(job);
                }
              }}
              className={cn(
                'px-3 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-2',
                (mode === 'dual' ? selectedJobs.includes(job) : selectedJob === job)
                  ? 'bg-accent-strong text-white shadow-sm'
                  : 'hover:bg-surface-4 text-muted hover:text-app',
              )}
            >
              <span>{job}</span>
            </button>
          ))}
        </div>
        {mode === 'dual' && (
          <span className="text-[10px] text-muted font-mono">最多 {maxJobs} 个</span>
        )}
      </div>

      <div className="w-[1px] h-6 bg-[var(--color-border)]"></div>

      <div className="flex items-center gap-3">
        <span className="text-muted text-xs font-bold uppercase tracking-wider">玩家</span>
        {mode === 'dual' ? (
          <div className="flex items-center gap-3">
            {selectedJobs.length === 0 && <div className="text-xs text-muted">先选择职业</div>}
            {selectedJobs.map((job) => (
              <div key={job} className="relative flex items-center gap-2">
                <span className="text-[10px] font-mono text-muted">{job}</span>
                <select
                  value={selectedPlayersByJob[job] ?? ''}
                  onChange={(e) => onSelectPlayerForJob(job, Number(e.target.value))}
                  aria-label={`选择玩家-${job}`}
                  className="appearance-none bg-surface-1 border border-app hover:border-[var(--color-accent)] rounded-lg pl-3 pr-8 py-1.5 text-sm w-72 text-app focus:outline-none focus:ring-1 focus:ring-[var(--color-focus)] transition-colors cursor-pointer"
                >
                  <option value="">选择玩家...</option>
                  {filteredActors(job).map((actor) => (
                    <option key={actor.id} value={actor.id}>
                      {actor.name} ({actor.type})
                    </option>
                  ))}
                </select>
                <div
                  className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-muted text-xs"
                  aria-hidden="true"
                >
                  ▼
                </div>
              </div>
            ))}
            {selectedJobs.length === 1 && (
              <div className="relative flex items-center gap-2 opacity-50">
                <span className="text-[10px] font-mono text-muted">---</span>
                <select
                  disabled
                  aria-label="第二位玩家占位"
                  className="appearance-none bg-surface-1 border border-app rounded-lg pl-3 pr-8 py-1.5 text-sm w-72 text-muted cursor-not-allowed"
                >
                  <option value="">选择第二名玩家...</option>
                </select>
              </div>
            )}
          </div>
        ) : (
          <div className="relative">
            <select
              value={selectedPlayerId ?? ''}
              onChange={(e) => onSelectPlayer(Number(e.target.value))}
              aria-label="选择玩家"
              className="appearance-none bg-surface-1 border border-app hover:border-[var(--color-accent)] rounded-lg pl-3 pr-8 py-1.5 text-sm w-80 text-app focus:outline-none focus:ring-1 focus:ring-[var(--color-focus)] transition-colors cursor-pointer"
            >
              <option value="">选择玩家...</option>
              {filteredActors(selectedJob).map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.name} ({actor.type})
                </option>
              ))}
            </select>
            <div
              className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-muted text-xs"
              aria-hidden="true"
            >
              ▼
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
