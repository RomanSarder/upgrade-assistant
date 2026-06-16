import { cn } from "@/lib/utils";

interface Props {
  limit: number;
  used: number;
  isAccumulating?: boolean;
}

export function BudgetMeter({ limit, used, isAccumulating }: Props) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const isNearLimit = pct >= 75;
  const isAtLimit = pct >= 100;

  const fillColor = isAtLimit
    ? "bg-red-500"
    : isNearLimit
      ? "bg-amber-400"
      : "bg-emerald-400";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-6 text-xs text-gray-500">
        <span className="font-medium">Demo budget</span>
        <span className="font-mono tabular-nums">
          ${used.toFixed(2)} / ${limit.toFixed(2)}
        </span>
      </div>
      <div
        role="meter"
        aria-label={`Demo budget: $${used.toFixed(2)} of $${limit.toFixed(2)} used`}
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={limit}
        className="h-1.5 w-48 rounded-full bg-gray-100 overflow-hidden"
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 motion-reduce:transition-none",
            fillColor,
            isAccumulating && "animate-pulse motion-reduce:animate-none",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
