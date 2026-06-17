import hostedGitInfo from "hosted-git-info";
import type { ChangelogResult, ContentSlice, NpmRepositoryField, NpmPackument } from "./types";
import { githubFetchPaginated } from "./github-client";
import { findMatchingTag, fetchGitHubReleases } from "./releases";
import { fetchChangelogFile } from "./changelog-file";

// npm's repository field can be a bare string ("github:owner/repo", "owner/repo") or an
// object. hosted-git-info accepts both, but we need to extract the string first.
function resolveRepoUrl(repo: NpmRepositoryField | undefined): string | undefined {
  if (!repo) return undefined;
  if (typeof repo === "string") return repo;
  return repo.url;
}

function resolveDirectory(repo: NpmRepositoryField | undefined): string | undefined {
  if (!repo || typeof repo === "string") return undefined;
  return repo.directory;
}

export async function fetchChangelog(
  packageName: string,
  fromVersion: string,
  toVersion: string,
): Promise<ChangelogResult> {
  let packument: NpmPackument;
  try {
    const npmRes = await fetch(
      `https://registry.npmjs.org/${encodeURIComponent(packageName)}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!npmRes.ok) return { status: "unknown" };
    packument = (await npmRes.json()) as NpmPackument;
  } catch {
    return { status: "unknown" };
  }

  const versionEntry = packument.versions?.[toVersion];
  const rawRepoUrl =
    resolveRepoUrl(versionEntry?.repository) ??
    resolveRepoUrl(packument.repository) ??
    versionEntry?.homepage ??
    packument.homepage;

  if (!rawRepoUrl) return { status: "unknown" };

  const info = hostedGitInfo.fromUrl(rawRepoUrl);
  if (!info || info.type !== "github") return { status: "unknown" };

  const owner = info.user;
  const repo = info.project;
  const directory =
    resolveDirectory(versionEntry?.repository) ?? resolveDirectory(packument.repository);

  let allTags: Array<{ name: string }>;
  try {
    allTags = await githubFetchPaginated<{ name: string }>(
      `https://api.github.com/repos/${owner}/${repo}/tags?per_page=100`,
    );
  } catch {
    return { status: "unknown" };
  }

  // Only pass packageName for monorepo tag disambiguation — non-monorepo repos don't
  // embed the package name in their tags, so passing it would pick the wrong one.
  const fromTag = findMatchingTag(fromVersion, allTags, directory ? packageName : undefined);
  const toTag = findMatchingTag(toVersion, allTags, directory ? packageName : undefined);

  // Without toTag we can't bound the upper end of the range via tags, so releases would be
  // unreliable. The changelog file doesn't need a tag, so we still try that.
  const [releasesSettled, changelogSettled] = await Promise.allSettled([
    toTag
      ? fetchGitHubReleases(owner, repo, fromVersion, toVersion)
      : Promise.resolve(null),
    fetchChangelogFile(owner, repo, fromVersion, toVersion, directory),
  ]);

  const releasesSlices =
    releasesSettled.status === "fulfilled" ? releasesSettled.value : null;
  const changelogSlices =
    changelogSettled.status === "fulfilled" ? changelogSettled.value : null;

  if (releasesSlices || changelogSlices) {
    let finalSlices: ContentSlice[];
    let finalSource: "github_releases" | "changelog_file";

    if (releasesSlices && changelogSlices) {
      const relLen = releasesSlices.reduce((n, s) => n + s.content.length, 0);
      const chgLen = changelogSlices.reduce((n, s) => n + s.content.length, 0);
      // In monorepos, GitHub Releases cover the whole repo, not just this package.
      // Always prefer the scoped changelog file regardless of content length.
      const preferChangelog = !!directory || chgLen >= relLen;
      if (preferChangelog) {
        finalSlices = changelogSlices;
        finalSource = "changelog_file";
      } else {
        finalSlices = releasesSlices;
        finalSource = "github_releases";
      }
    } else if (changelogSlices) {
      finalSlices = changelogSlices;
      finalSource = "changelog_file";
    } else {
      finalSlices = releasesSlices!;
      finalSource = "github_releases";
    }

    return {
      status: "found",
      content: finalSlices.map((s) => s.content).join("\n\n"),
      source: finalSource,
      versions: finalSlices.map((s) => s.version),
      slices: finalSlices,
    };
  }

  if (fromTag && toTag) {
    return {
      status: "partial",
      compareUrl: `https://github.com/${owner}/${repo}/compare/${fromTag.name}...${toTag.name}`,
      source: "compare_url",
    };
  }

  return { status: "unknown" };
}
