import semver from "semver";
import type { ContentSlice, GitHubTreeItem, GitHubRepo, GitHubTree } from "./types";
import { githubFetch } from "./github-client";

const CHANGELOG_NAMES = ["changelog", "changes", "history", "release", "news", "releases"];
const VALID_EXTENSIONS = [".md", ".markdown", ".txt", ""];
const REJECT_EXTENSIONS = [".sh", ".json"];

function parseFilename(file: GitHubTreeItem): { ext: string; nameWithoutExt: string } {
  const basename = file.path.split("/").pop()!.toLowerCase();
  const extMatch = basename.match(/(\.[^.]+)$/);
  const ext = extMatch ? extMatch[1] : "";
  const nameWithoutExt = ext ? basename.slice(0, -ext.length) : basename;
  return { ext, nameWithoutExt };
}

function isValidCandidate(file: GitHubTreeItem): boolean {
  const { ext, nameWithoutExt } = parseFilename(file);
  if (REJECT_EXTENSIONS.includes(ext)) return false;
  if (!VALID_EXTENSIONS.includes(ext)) return false;
  return CHANGELOG_NAMES.includes(nameWithoutExt);
}

function scoreCandidate(file: GitHubTreeItem): number {
  const { ext, nameWithoutExt } = parseFilename(file);
  // Lower score = higher priority. ×10 ensures name rank dominates over extension rank.
  return CHANGELOG_NAMES.indexOf(nameWithoutExt) * 10 + VALID_EXTENSIONS.indexOf(ext);
}

function parseChangelogSections(
  content: string,
  fromVersion: string,
  toVersion: string,
): ContentSlice[] | null {
  const lines = content.split("\n");
  const sectionStarts: Array<{ version: string; lineIndex: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^#{1,3}\s/.test(line)) {
      const versionMatch = line.match(/(\d+\.\d+(?:\.\d+)?(?:[-+][^\s]*)?)/);
      if (versionMatch) {
        const ver = semver.valid(semver.coerce(versionMatch[1]));
        if (ver) sectionStarts.push({ version: ver, lineIndex: i });
      }
    }
  }

  const slices: ContentSlice[] = [];

  for (let i = 0; i < sectionStarts.length; i++) {
    const { version, lineIndex } = sectionStarts[i];
    // Exclude versions outside (fromVersion, toVersion]: skip if version <= from or version > to
    if (!semver.gt(version, fromVersion) || !semver.lte(version, toVersion)) continue;
    const endLine = sectionStarts[i + 1]?.lineIndex ?? lines.length;
    slices.push({
      version,
      content: lines.slice(lineIndex, endLine).join("\n").trim(),
    });
  }

  if (slices.length === 0) return null;
  slices.sort((a, b) => semver.rcompare(a.version, b.version));
  return slices;
}

export async function fetchChangelogFile(
  owner: string,
  repo: string,
  fromVersion: string,
  toVersion: string,
  directory?: string,
): Promise<ContentSlice[] | null> {
  const repoRes = await githubFetch(`https://api.github.com/repos/${owner}/${repo}`);
  if (!repoRes.ok) return null;
  const repoData = (await repoRes.json()) as GitHubRepo;
  const branch = repoData.default_branch;

  const treeRes = await githubFetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
  );
  if (!treeRes.ok) return null;
  const treeData = (await treeRes.json()) as GitHubTree;

  if (treeData.truncated) {
    console.warn(`[changelog] GitHub tree response truncated for ${owner}/${repo}`);
  }

  let files = treeData.tree.filter((f) => f.type === "blob");

  if (directory) {
    const prefix = directory.replace(/\/$/, "") + "/";
    files = files.filter((f) => f.path.startsWith(prefix));
  }

  const candidates = files
    .filter((f) => isValidCandidate(f) && f.size >= 100 && f.size <= 1_000_000)
    .sort((a, b) => scoreCandidate(a) - scoreCandidate(b));

  if (candidates.length === 0) return null;

  // Fetch all candidates in parallel but iterate results in priority order so the
  // best-named file wins when multiple files parse equally well.
  const top = candidates.slice(0, 5);
  const fetched = await Promise.allSettled(
    top.map(async (file) => {
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${file.path}`;
      const rawRes = await fetch(rawUrl, { signal: AbortSignal.timeout(15_000) });
      if (!rawRes.ok) throw new Error(`HTTP ${rawRes.status}`);
      const text = await rawRes.text();
      if (text.length < 100 || text.length > 1_000_000) throw new Error("size out of range");
      return text;
    }),
  );

  let bestSlices: ContentSlice[] | null = null;
  let bestMentionsVersion = false;

  for (const result of fetched) {
    if (result.status !== "fulfilled") continue;
    const text = result.value;
    const mentionsVersion = text.includes(toVersion);
    const slices = parseChangelogSections(text, fromVersion, toVersion);

    if (slices && (bestSlices === null || (mentionsVersion && !bestMentionsVersion))) {
      bestSlices = slices;
      bestMentionsVersion = mentionsVersion;
      if (mentionsVersion) break;
    }
  }

  return bestSlices;
}
