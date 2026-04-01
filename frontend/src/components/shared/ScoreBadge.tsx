import { getScoreColor } from '@/lib/format';

export default function ScoreBadge({ score, label }: { score: number; label?: string }) {
  const colorClass = getScoreColor(score);

  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-xs text-gray-400">{label}</span>}
      <div className="flex items-center gap-1">
        <div className={`h-2 w-2 rounded-full ${colorClass}`} />
        <span className="text-sm font-semibold">{score}</span>
      </div>
    </div>
  );
}
