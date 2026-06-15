import { useRef, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Loader2, ChevronRight, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { AnalysisRow, RiskLevel, StreamLogEntry } from "./types";

const RISK_CONFIG: Record<
  RiskLevel,
  { badge: string; row: string; terminal: string; dot: string; label: string; sheetBg: string }
> = {
  safe:     { badge: "bg-emerald-100 text-emerald-800 border-emerald-200", row: "",                terminal: "text-emerald-400", dot: "bg-emerald-400", label: "Safe",     sheetBg: "bg-gray-50 border-gray-100" },
  low:      { badge: "bg-sky-100 text-sky-800 border-sky-200",             row: "",                terminal: "text-sky-400",     dot: "bg-sky-400",     label: "Low",      sheetBg: "bg-gray-50 border-gray-100" },
  medium:   { badge: "bg-amber-100 text-amber-800 border-amber-200",       row: "bg-amber-50/50",  terminal: "text-amber-400",   dot: "bg-amber-400",   label: "Medium",   sheetBg: "bg-gray-50 border-gray-100" },
  high:     { badge: "bg-orange-100 text-orange-800 border-orange-200",    row: "bg-orange-50/50", terminal: "text-orange-400",  dot: "bg-orange-400",  label: "High",     sheetBg: "bg-orange-50/60 border-orange-100" },
  breaking: { badge: "bg-red-200 text-red-900 border-red-300 font-semibold", row: "bg-red-50/60", terminal: "text-red-400",     dot: "bg-red-500",     label: "Breaking", sheetBg: "bg-red-50/60 border-red-100" },
  unknown:  { badge: "bg-gray-100 text-gray-500 border-gray-200",          row: "",                terminal: "text-gray-500",    dot: "bg-gray-400",    label: "Unknown",  sheetBg: "bg-gray-50 border-gray-100" },
};

const RISK_ORDER: RiskLevel[] = ["breaking", "high", "medium", "low", "safe", "unknown"];

const MARKDOWN_COMPONENTS: React.ComponentProps<typeof ReactMarkdown>["components"] = {
  h1: ({ children }) => <h1 className="text-base font-semibold mt-4 mb-1.5 text-gray-900">{children}</h1>,
  h2: ({ children }) => <h2 className="text-sm font-semibold mt-3 mb-1 text-gray-900">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-medium mt-2 mb-0.5 text-gray-800">{children}</h3>,
  p: ({ children }) => <p className="text-sm text-gray-700 mb-2 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 space-y-1 pl-4 text-sm text-gray-700 list-disc">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 space-y-1 pl-4 text-sm text-gray-700 list-decimal">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  code: ({ children }) => <code className="bg-gray-100 rounded px-1 py-0.5 font-mono text-xs text-gray-800">{children}</code>,
  pre: ({ children }) => <pre className="bg-gray-100 rounded p-3 overflow-x-auto font-mono text-xs mb-2">{children}</pre>,
  strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
  em: ({ children }) => <em className="italic text-gray-600">{children}</em>,
  blockquote: ({ children }) => <blockquote className="border-l-2 border-gray-300 pl-3 text-gray-600 italic mb-2">{children}</blockquote>,
  a: ({ href, children }) => <a href={href} className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">{children}</a>,
};

function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <Badge variant="outline" className={RISK_CONFIG[level]?.badge ?? RISK_CONFIG.unknown.badge}>
      {RISK_CONFIG[level]?.label ?? level}
    </Badge>
  );
}

function PackageStartEntry({ text }: { text: string }) {
  return (
    <div className="pt-5 first:pt-0 pb-1">
      <div className="flex items-center gap-2.5 mb-2">
        <span className="text-indigo-400 text-base leading-none select-none">◆</span>
        <span className="text-white font-semibold text-sm tracking-tight">{text}</span>
      </div>
      <div className="h-px bg-gray-800" />
    </div>
  );
}

function ChangelogFoundEntry({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 pl-5 py-0.5 text-emerald-400 text-sm">
      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
      <span>{text}</span>
    </div>
  );
}

function ChangelogMissingEntry({ text }: { text: string }) {
  return (
    <div className="pl-5 py-0.5">
      <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-950/60 border border-amber-700/40 px-2.5 py-1 text-sm text-amber-300 font-medium">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        {text}
      </span>
    </div>
  );
}

function NpmMetadataEntry({ text }: { text: string }) {
  return (
    <div className="pl-5 py-0.5 text-sky-400/80 text-sm">
      <span className="mr-1.5 opacity-60">↗</span>
      {text}
    </div>
  );
}

function QueryEntry({ text }: { text: string }) {
  return (
    <div className="pl-7 py-0.5 text-gray-500 text-sm">
      <span className="mr-1.5 text-gray-600">→</span>
      <span className="italic">{text}</span>
    </div>
  );
}

function RiskEntry({ text, riskLevel }: { text: string; riskLevel?: RiskLevel }) {
  const cfg = RISK_CONFIG[riskLevel ?? "unknown"];
  const isHighSeverity = riskLevel === "breaking" || riskLevel === "high";
  return (
    <div className={`pl-5 py-1.5 flex items-start gap-3 ${isHighSeverity ? "bg-gray-900/60 rounded-md mt-0.5 pr-3" : ""}`}>
      <span className={`shrink-0 mt-0.5 text-xs font-bold uppercase tracking-wider ${cfg.terminal}`}>
        ■ {cfg.label}
      </span>
      <span className="text-gray-400 text-xs leading-relaxed font-sans">{text}</span>
    </div>
  );
}

function ToolErrorEntry({ text }: { text: string }) {
  return (
    <div className="pl-5 py-0.5 flex items-center gap-2 text-red-400 text-sm">
      <XCircle className="h-3.5 w-3.5 shrink-0" />
      <span>{text}</span>
    </div>
  );
}

function LogEntry({ entry }: { entry: StreamLogEntry }) {
  const { kind, text, riskLevel } = entry;
  switch (kind) {
    case "package_start":     return <PackageStartEntry text={text} />;
    case "changelog_found":   return <ChangelogFoundEntry text={text} />;
    case "changelog_missing": return <ChangelogMissingEntry text={text} />;
    case "npm_metadata":      return <NpmMetadataEntry text={text} />;
    case "query":             return <QueryEntry text={text} />;
    case "risk":              return <RiskEntry text={text} riskLevel={riskLevel} />;
    case "tool_error":        return <ToolErrorEntry text={text} />;
    default:                  return <div className="pl-5 py-0.5 text-gray-500 text-sm">{text}</div>;
  }
}

function StreamLog({ entries, isStreaming }: { entries: StreamLogEntry[]; isStreaming: boolean }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  return (
    <div className="bg-gray-950 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-800/80">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-gray-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-gray-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-gray-700" />
        </div>
        <span className="ml-2 text-xs text-gray-500 font-mono">upgrade-advisor · agent</span>
        {isStreaming && (
          <div className="ml-auto flex items-center gap-1.5 text-xs text-gray-500">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>running</span>
          </div>
        )}
      </div>
      <div className="h-[50vh] overflow-y-auto p-4 font-mono space-y-0.5 scroll-smooth">
        {entries.length === 0 && isStreaming && (
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Connecting…</span>
          </div>
        )}
        {entries.map((entry) => (
          <LogEntry key={entry.id} entry={entry} />
        ))}
        {isStreaming && entries.length > 0 && (
          <div className="pl-5 py-1">
            <span className="inline-block h-3.5 w-1.5 bg-indigo-400 animate-pulse rounded-sm" />
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function SummaryCard({ level, count }: { level: RiskLevel; count: number }) {
  const cfg = RISK_CONFIG[level];
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 flex items-center gap-3 shadow-sm">
      <span className={`h-2 w-2 rounded-full shrink-0 ${cfg.dot}`} />
      <div>
        <p className="text-2xl font-bold text-gray-900 leading-none">{count}</p>
        <p className="text-xs text-gray-500 mt-0.5">{cfg.label}</p>
      </div>
    </div>
  );
}

function SummaryCards({ counts }: { counts: Record<string, number> }) {
  const items = RISK_ORDER.filter((level) => (counts[level] ?? 0) > 0);
  if (items.length === 0) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
      {items.map((level) => (
        <SummaryCard key={level} level={level} count={counts[level] ?? 0} />
      ))}
    </div>
  );
}

function BreakingChangesSheet({ row, onClose }: { row: AnalysisRow | null; onClose: () => void }) {
  if (!row) return null;
  const cfg = RISK_CONFIG[row.risk_level];
  return (
    <Sheet open={row !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-[520px] sm:max-w-[520px] overflow-y-auto">
        <SheetHeader className="pb-3">
          <SheetTitle className="font-mono text-base">{row.package}</SheetTitle>
          <SheetDescription className="font-mono text-xs">
            {row.from_version} → {row.to_version}
          </SheetDescription>
          <div className="pt-1">
            <RiskBadge level={row.risk_level} />
          </div>
        </SheetHeader>
        <div className="px-1 pt-2 pb-6 space-y-4">
          {row.breaking_changes ? (
            <div className={`rounded-lg p-4 border ${cfg.sheetBg}`}>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Breaking Changes</p>
              <ReactMarkdown components={MARKDOWN_COMPONENTS}>
                {row.breaking_changes}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-3">
              <p className="text-sm text-emerald-700">No breaking changes recorded for this upgrade.</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function AnalysisResultsTable({
  rows,
  onViewDetails,
}: {
  rows: AnalysisRow[];
  onViewDetails: (row: AnalysisRow) => void;
}) {
  const sorted = [...rows].sort(
    (a, b) => RISK_ORDER.indexOf(a.risk_level) - RISK_ORDER.indexOf(b.risk_level),
  );

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-gray-100">
          <TableHead className="text-xs font-semibold uppercase tracking-wide text-gray-400">Package</TableHead>
          <TableHead className="text-xs font-semibold uppercase tracking-wide text-gray-400">Version Range</TableHead>
          <TableHead className="text-xs font-semibold uppercase tracking-wide text-gray-400">Risk</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((row) => {
          const cfg = RISK_CONFIG[row.risk_level];
          return (
            <TableRow key={row.package} className={`border-gray-100 ${cfg.row}`}>
              <TableCell className="font-mono font-semibold text-sm text-gray-900">{row.package}</TableCell>
              <TableCell className="font-mono text-sm text-gray-500">
                {row.from_version}
                <span className="mx-1.5 text-gray-300">→</span>
                {row.to_version}
              </TableCell>
              <TableCell><RiskBadge level={row.risk_level} /></TableCell>
              <TableCell className="text-right pr-3">
                {row.breaking_changes && (
                  <button
                    onClick={() => onViewDetails(row)}
                    className="inline-flex items-center gap-0.5 rounded-md px-2 py-1 text-xs font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
                  >
                    Details <ChevronRight className="h-3 w-3" />
                  </button>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function AnalysisResults({ rows, counts }: { rows: AnalysisRow[]; counts: Record<string, number> }) {
  const [selectedRow, setSelectedRow] = useState<AnalysisRow | null>(null);
  return (
    <div className="space-y-4">
      <SummaryCards counts={counts} />
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        <AnalysisResultsTable rows={rows} onViewDetails={setSelectedRow} />
      </div>
      <BreakingChangesSheet row={selectedRow} onClose={() => setSelectedRow(null)} />
    </div>
  );
}

interface Props {
  isStreaming: boolean;
  logEntries: StreamLogEntry[];
  analysisRows: AnalysisRow[];
  summaryCounts: Record<string, number>;
  finalCost: { tokens_used: number; cost_usd: number } | null;
  onReset: () => void;
}

export function AnalysisStream({ isStreaming, logEntries, analysisRows, summaryCounts, finalCost, onReset }: Props) {
  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-8 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-mono uppercase tracking-widest text-gray-400 mb-1">upgrade-advisor</p>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
              {isStreaming ? "Analysing packages…" : "Analysis complete"}
            </h1>
          </div>
          {!isStreaming && (
            <button
              onClick={onReset}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-all duration-150 hover:bg-gray-50 hover:border-gray-300 active:scale-[0.99]"
            >
              Analyse another
            </button>
          )}
        </div>

        <StreamLog entries={logEntries} isStreaming={isStreaming} />

        {analysisRows.length > 0 && (
          <AnalysisResults rows={analysisRows} counts={summaryCounts} />
        )}

        {!isStreaming && finalCost && (
          <p className="text-center text-xs text-gray-400 font-mono">
            {finalCost.tokens_used.toLocaleString()} tokens · ${finalCost.cost_usd.toFixed(4)}
          </p>
        )}
      </div>
    </div>
  );
}
