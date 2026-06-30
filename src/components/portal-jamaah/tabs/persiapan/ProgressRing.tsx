const DEFAULT_RADIUS = 18;
const DEFAULT_CIRCUMFERENCE = 113.097;

export default function ProgressRing({ percentage, size = 44 }: { percentage: number; size?: number }) {
  const safePct = Math.max(0, Math.min(100, Math.round(Number(percentage || 0))));
  const radius = size === 44 ? DEFAULT_RADIUS : (size - 8) / 2;
  const circumference = size === 44 ? DEFAULT_CIRCUMFERENCE : 2 * Math.PI * radius;
  const offset = circumference * (1 - safePct / 100);

  return (
    <div className="relative flex-none text-emerald-700 dark:text-emerald-300" style={{ width: size, height: size }}>
      <svg className="-rotate-90" width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} className="stroke-slate-200 dark:stroke-slate-700" strokeWidth="4" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth="4"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[11px] font-bold">{safePct}%</span>
      </div>
    </div>
  );
}
