import type { Skill } from '../../model/types';
import { cn } from "../../utils";

interface Props {
    skill: Skill;
    className?: string;
}

export function SkillCard({ skill, className }: Props) {
    return (
        <div
            className={cn(
                "p-2 rounded text-sm font-medium shadow text-white border border-transparent transition-colors cursor-grab",
                skill.color || 'bg-gray-600',
                className
            )}
        >
            <div className="flex justify-between pointer-events-none">
                <span>{skill.name}</span>
                <span className="text-xs opacity-75">{skill.durationSec}s</span>
            </div>
            <div className="text-xs opacity-75 mt-1 pointer-events-none">CD: {skill.cooldownSec}s</div>
        </div>
    );
}
