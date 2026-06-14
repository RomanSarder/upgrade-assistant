export interface PackageResult {
  name: string;
  currentVersion: string;
  latestVersion: string | null;
  isDev: boolean;
  upgradeAvailable: boolean;
}
