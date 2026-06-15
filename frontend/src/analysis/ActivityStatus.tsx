import type { CurrentActivity } from "./useAnalysisStream";

const TOOL_LABELS: Record<string, string> = {
  fetch_changelog:    "Fetching changelog",
  query_changelog:    "Querying changelog",
  check_npm_metadata: "Checking npm metadata",
  synthesise_risk:    "Assessing risk",
};

interface Props {
  currentActivity: CurrentActivity;
  completedCount: number;
}

export function ActivityStatus({ currentActivity, completedCount }: Props) {
  const { currentPackage, currentToolName } = currentActivity;
  const stepLabel = currentToolName ? (TOOL_LABELS[currentToolName] ?? currentToolName) : "Connecting…";
  return (
    <div className="rounded-xl bg-gray-950 border border-gray-800/80 px-4 py-3 flex items-center gap-3 font-mono">
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-indigo-500" />
      </span>
      <span className="text-sm text-gray-200 min-w-0 truncate" aria-live="polite" aria-atomic="true">
        {stepLabel}
        {currentPackage && (
          <>
            <span className="mx-2 text-gray-600" aria-hidden="true">·</span>
            <span className="text-indigo-300">{currentPackage}</span>
          </>
        )}
      </span>
      {completedCount > 0 && (
        <span className="ml-auto shrink-0 text-xs text-gray-500 tabular-nums">{completedCount} analysed</span>
      )}
    </div>
  );
}
