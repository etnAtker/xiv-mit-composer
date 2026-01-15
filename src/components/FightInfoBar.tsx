import type { Actor, Fight, Job } from '../model/types';
import { cn } from '../utils';
import { MS_PER_SEC, TIME_DECIMAL_PLACES } from '../constants/time';

interface Props {
  fight: Fight;
  actors: Actor[];
  selectedJob: Job | null;
  selectedPlayerId: number | null;
  onSelectJob: (job: Job) => void;
  onSelectPlayer: (id: number) => void;
}

const JOBS: Job[] = ['PLD', 'WAR', 'DRK', 'GNB'];

export function FightInfoBar({
  fight,
  actors,
  selectedJob,
  selectedPlayerId,
  onSelectJob,
  onSelectPlayer
}: Props) {
  return (
    <div className="px-6 py-3 bg-gray-900 border-b border-gray-800 flex gap-6 items-center flex-wrap z-10 relative shadow-sm">
      <div className="flex items-center gap-2">
        <span className="text-gray-500 text-xs font-bold uppercase tracking-wider">战斗</span>
        <span className="font-semibold text-white">{fight.name}</span>
        <span className="text-xs text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">{(fight.durationMs / MS_PER_SEC).toFixed(TIME_DECIMAL_PLACES)}s</span>
      </div>

      <div className="w-[1px] h-6 bg-gray-800"></div>

      <div className="flex items-center gap-3">
        <span className="text-gray-500 text-xs font-bold uppercase tracking-wider">职业</span>
        <div className="flex bg-gray-800 rounded-lg p-1 gap-1 border border-gray-700">
          {JOBS.map(job => (
            <button
              key={job}
              onClick={() => onSelectJob(job)}
              className={cn(
                'px-3 py-1 rounded-md text-xs font-bold transition-all',
                selectedJob === job ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-gray-700 text-gray-400 hover:text-gray-200'
              )}
            >
              {job}
            </button>
          ))}
        </div>
      </div>

      <div className="w-[1px] h-6 bg-gray-800"></div>

      <div className="flex items-center gap-3">
        <span className="text-gray-500 text-xs font-bold uppercase tracking-wider">玩家</span>
        <div className="relative">
          <select
            value={selectedPlayerId ?? ''}
            onChange={e => onSelectPlayer(Number(e.target.value))}
            className="appearance-none bg-gray-800 border border-gray-700 hover:border-gray-600 rounded-lg pl-3 pr-8 py-1.5 text-sm w-64 text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors cursor-pointer"
          >
            <option value="">选择玩家...</option>
            {actors
              .filter(actor => {
                if (!selectedJob) return true;
                const map: Record<Job, string[]> = {
                  PLD: ['Paladin'],
                  WAR: ['Warrior'],
                  DRK: ['DarkKnight', 'Dark Knight'],
                  GNB: ['Gunbreaker']
                };
                return map[selectedJob]?.includes(actor.type) || map[selectedJob]?.includes(actor.subType);
              })
              .map(actor => (
                <option key={actor.id} value={actor.id}>{actor.name} ({actor.type})</option>
              ))}
          </select>
          <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-gray-500 text-xs">▼</div>
        </div>
      </div>
    </div>
  );
}
