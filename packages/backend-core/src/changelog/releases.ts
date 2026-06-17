import semver from "semver";
import type { ContentSlice, GitHubTag, GitHubRelease } from "./types";
import { githubFetchPaginated } from "./github-client";

export function extractVersionFromTag(tagName: string): string | null {
  const stripped = tagName.replace(/^[^\d]*/, "");
  return semver.valid(semver.coerce(stripped));
}

export function findMatchingTag(
  version: string,
  tags: GitHubTag[],
  packageName?: string,
): GitHubTag | null {
  const candidates = tags.filter((tag) => {
    const ver = extractVersionFromTag(tag.name);
    return ver !== null && semver.eq(ver, version);
  });

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // In monorepos, tags include the package name (e.g. "react-dom@18.0.0"). Strip the npm
  // scope so "react-dom" matches inside the tag rather than "@react-dom".
  if (packageName) {
    const bare = packageName.replace(/^@[^/]+\//, "");
    const preferred = candidates.find((t) =>
      t.name.toLowerCase().includes(bare.toLowerCase()),
    );
    if (preferred) return preferred;
  }

  return candidates[0];
}

export async function fetchGitHubReleases(
  owner: string,
  repo: string,
  fromVersion: string,
  toVersion: string,
): Promise<ContentSlice[] | null> {
  const releases = await githubFetchPaginated<GitHubRelease>(
    `https://api.github.com/repos/${owner}/${repo}/releases?per_page=100`,
  );

  // flatMap computes the version once per release; separate filter/sort/map would call
  // extractVersionFromTag three times per item
  const withVersions = releases
    .filter((r) => !r.draft)
    .flatMap((r) => {
      const ver = extractVersionFromTag(r.tag_name);
      return ver !== null && semver.gt(ver, fromVersion) && semver.lte(ver, toVersion)
        ? [{ r, ver }]
        : [];
    })
    .sort((a, b) => semver.rcompare(a.ver, b.ver));

  if (withVersions.length === 0) return null;

  return withVersions.map(({ r, ver }) => ({
    version: ver,
    content: `## ${r.tag_name}\n\n${r.body ?? ""}`.trim(),
  }));
}
