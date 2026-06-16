export const DEMO_BUDGET_USD = 2.00;

export type ChangelogInfo =
  | { status: "found"; content: string; source: "github_releases" | "changelog_file"; versions: string[]; slices: Array<{ version: string; content: string }> }
  | { status: "partial"; compareUrl: string }
  | { status: "unknown" };

export interface PackageResult {
  name: string;
  currentVersion: string;
  latestVersion: string | null;
  isDev: boolean;
  upgradeAvailable: boolean;
  changelog: ChangelogInfo;
}
