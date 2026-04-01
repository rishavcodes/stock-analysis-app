export default function ScoreGauge({
  score,
  label = 'Overall Score',
}: {
  score: number;
  label?: string;
}) {
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const color =
    score >= 75
      ? '#22C55E'
      : score >= 50
        ? '#EAB308'
        : score >= 25
          ? '#F97316'
          : '#EF4444';

  return (
    <div className="flex flex-col items-center">
      <svg width="120" height="120" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="#1F2937"
          strokeWidth="8"
        />
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dashoffset 0.5s ease-in-out' }}
        />
        <text
          x="50"
          y="46"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="white"
          fontSize="24"
          fontWeight="bold"
        >
          {score}
        </text>
        <text
          x="50"
          y="62"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#6B7280"
          fontSize="8"
        >
          /100
        </text>
      </svg>
      <span className="mt-1 text-xs text-gray-400">{label}</span>
    </div>
  );
}
