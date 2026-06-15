import { useState, useRef, useEffect } from "react";
import type { AnalysisRow, LogEntryKind, RiskLevel, StreamLogEntry } from "./types";

interface UseAnalysisStreamResult {
  logEntries: StreamLogEntry[];
  analysisRows: AnalysisRow[];
  summaryCounts: Record<string, number>;
  finalCost: { tokens_used: number; cost_usd: number } | null;
}

export function useAnalysisStream(
  jobId: string | null,
  active: boolean,
  onDone: () => void,
  onError: (message: string) => void,
): UseAnalysisStreamResult {
  const [logEntries, setLogEntries] = useState<StreamLogEntry[]>([]);
  const [analysisRows, setAnalysisRows] = useState<AnalysisRow[]>([]);
  const [summaryCounts, setSummaryCounts] = useState<Record<string, number>>({});
  const [finalCost, setFinalCost] = useState<{ tokens_used: number; cost_usd: number } | null>(null);

  const logCounterRef = useRef(0);
  const packageMetaRef = useRef<Record<string, { from_version: string; to_version: string }>>({});
  const onDoneRef = useRef(onDone);
  const onErrorRef = useRef(onError);
  onDoneRef.current = onDone;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!active || !jobId) return;

    setLogEntries([]);
    setAnalysisRows([]);
    setSummaryCounts({});
    setFinalCost(null);
    logCounterRef.current = 0;
    packageMetaRef.current = {};

    const addLog = (text: string, kind: LogEntryKind = "info", riskLevel?: RiskLevel) => {
      setLogEntries((prev) => [...prev, { id: logCounterRef.current++, text, kind, riskLevel }]);
    };

    const source = new EventSource(`/api/packages/stream?jobId=${jobId}`, { withCredentials: true });

    const handleEvent = (event: { type: string; payload?: unknown }) => {
      switch (event.type) {
        case "package_start": {
          const p = event.payload as { package: string; from_version: string; to_version: string };
          packageMetaRef.current[p.package] = { from_version: p.from_version, to_version: p.to_version };
          addLog(`${p.package}  ${p.from_version} → ${p.to_version}`, "package_start");
          break;
        }
        case "tool_call": {
          const p = event.payload as { tool_name: string; input: unknown; result: unknown };
          if (p.tool_name === "fetch_changelog") {
            const r = p.result as { status?: string; source?: string; versions?: string[] };
            if (r.status === "found") {
              const count = r.versions?.length ?? 0;
              addLog(
                `changelog · ${r.source ?? "unknown"} · ${count} version${count !== 1 ? "s" : ""}`,
                "changelog_found",
              );
            } else {
              addLog("no changelog available", "changelog_missing");
            }
          } else if (p.tool_name === "query_changelog") {
            const i = p.input as { question: string };
            addLog(i.question, "query");
          } else if (p.tool_name === "check_npm_metadata") {
            const r = p.result as {
              weekly_downloads?: number | null;
              is_deprecated?: boolean;
              last_publish?: string | null;
            };
            const parts: string[] = [];
            if (r.weekly_downloads != null) {
              parts.push(`${(r.weekly_downloads / 1_000_000).toFixed(1)}M weekly downloads`);
            }
            if (r.is_deprecated) parts.push("deprecated");
            if (r.last_publish) {
              const date = new Date(r.last_publish).toLocaleDateString("en-US", {
                month: "short",
                year: "numeric",
              });
              parts.push(`last published ${date}`);
            }
            addLog(parts.join(" · ") || "npm metadata checked", "npm_metadata");
          } else if (p.tool_name === "synthesise_risk") {
            const i = p.input as {
              findings: Array<{
                package: string;
                risk_level: string;
                breaking_changes?: string;
                reasoning?: string;
              }>;
            };
            for (const f of i.findings) {
              const riskLevel = f.risk_level as RiskLevel;
              const description = f.breaking_changes || f.reasoning || "no breaking changes";
              const truncated = description.length > 200 ? description.slice(0, 200) + "…" : description;
              addLog(truncated, "risk", riskLevel);
            }
          }
          break;
        }
        case "tool_error": {
          const p = event.payload as { tool_name: string; error: string };
          addLog(`${p.tool_name}: ${p.error}`, "tool_error");
          break;
        }
        case "package_done": {
          const p = event.payload as { package: string; risk_level: string; breaking_changes?: string | null };
          const meta = packageMetaRef.current[p.package] ?? { from_version: "?", to_version: "?" };
          const row: AnalysisRow = {
            package: p.package,
            from_version: meta.from_version,
            to_version: meta.to_version,
            risk_level: p.risk_level as RiskLevel,
            breaking_changes: p.breaking_changes ?? undefined,
          };
          setAnalysisRows((prev) => [...prev, row]);
          setSummaryCounts((prev) => ({ ...prev, [p.risk_level]: (prev[p.risk_level] ?? 0) + 1 }));
          break;
        }
        case "done": {
          const p = event.payload as { cost_usd: number; tokens_used: number };
          source.close();
          setFinalCost(p);
          onDoneRef.current();
          break;
        }
        case "error": {
          const p = event.payload as { message?: string };
          onErrorRef.current(p.message ?? "Analysis failed.");
          break;
        }
      }
    };

    source.onmessage = (e: MessageEvent<string>) => {
      try {
        handleEvent(JSON.parse(e.data) as { type: string; payload?: unknown });
      } catch {}
    };

    source.onerror = () => {
      onErrorRef.current("Stream connection lost.");
      source.close();
    };

    return () => { source.close(); };
  }, [jobId, active]);

  return { logEntries, analysisRows, summaryCounts, finalCost };
}
