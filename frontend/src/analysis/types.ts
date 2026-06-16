export type PageState = "idle" | "streaming" | "done" | "error";

export type RiskLevel = "safe" | "low" | "medium" | "high" | "breaking" | "unknown";

export type LogEntryKind =
  | "package_start"
  | "changelog_found"
  | "changelog_missing"
  | "npm_metadata"
  | "query"
  | "risk"
  | "tool_error"
  | "info";

export interface AnalysisRow {
  package: string;
  from_version: string;
  to_version: string;
  risk_level: RiskLevel;
  breaking_changes?: string;
}

export interface Budget {
  limit: number;
  used: number;
}

export interface StreamLogEntry {
  id: number;
  text: string;
  kind: LogEntryKind;
  riskLevel?: RiskLevel;
}
