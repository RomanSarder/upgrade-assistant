export type ChangelogResult =
  | { status: "found"; content: string; source: "github_releases" | "changelog_file"; versions: string[]; slices: ContentSlice[] }
  | { status: "partial"; compareUrl: string; source: "compare_url" }
  | { status: "unknown" };

export type ContentSlice = { version: string; content: string };

export type NpmRepositoryField = string | { url?: string; directory?: string };

export interface NpmVersionEntry {
  repository?: NpmRepositoryField;
  homepage?: string;
}

export interface NpmPackument {
  repository?: NpmRepositoryField;
  homepage?: string;
  versions?: Record<string, NpmVersionEntry>;
}

export interface GitHubTag {
  name: string;
}

export interface GitHubRelease {
  tag_name: string;
  body: string | null;
  draft: boolean;
}

export interface GitHubTreeItem {
  path: string;
  size: number;
  type: "blob" | "tree";
}

export interface GitHubRepo {
  default_branch: string;
}

export interface GitHubTree {
  tree: GitHubTreeItem[];
  truncated: boolean;
}
