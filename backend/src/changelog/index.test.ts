import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchChangelog } from "@upgrade-advisor/backend-core/changelog/fetch";

const OWNER = "owner";
const REPO = "myrepo";
const NPM_URL = "https://registry.npmjs.org/my-package";

function makePackument(repoUrl?: string) {
  return {
    versions: {
      "2.0.0": repoUrl ? { repository: { url: repoUrl } } : {},
    },
    ...(repoUrl ? { repository: { url: repoUrl } } : {}),
  };
}

const GITHUB_REPO_URL = `https://github.com/${OWNER}/${REPO}`;

function makeTags() {
  return [{ name: "v1.0.0" }, { name: "v2.0.0" }];
}

function makeReleases(body = "## v2.0.0\n\nSome changes") {
  return [{ tag_name: "v2.0.0", body, draft: false }];
}

function makeTree(files: Array<{ path: string; size: number }> = []) {
  return {
    tree: files.map((f) => ({ ...f, type: "blob" })),
    truncated: false,
  };
}

type MockRoutes = {
  npmPackument?: object;
  tags?: object[];
  releases?: object[];
  repoInfo?: object;
  tree?: object;
  rawFile?: string;
};

function mockFetch(routes: MockRoutes) {
  vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = String(input);

    if (url === NPM_URL) {
      if (!routes.npmPackument) return new Response("", { status: 404 });
      return new Response(JSON.stringify(routes.npmPackument), { status: 200 });
    }

    if (url.includes("/tags")) {
      return new Response(JSON.stringify(routes.tags ?? []), { status: 200 });
    }

    if (url.includes("/releases")) {
      return new Response(JSON.stringify(routes.releases ?? []), { status: 200 });
    }

    if (url.startsWith("https://raw.githubusercontent.com/")) {
      if (!routes.rawFile) return new Response("", { status: 404 });
      return new Response(routes.rawFile, { status: 200 });
    }

    if (url.includes("/git/trees/")) {
      return new Response(JSON.stringify(routes.tree ?? makeTree()), { status: 200 });
    }

    // GitHub repo info: https://api.github.com/repos/owner/repo (no further path segments)
    if (url.match(/api\.github\.com\/repos\/[^/]+\/[^/]+$/)) {
      return new Response(
        JSON.stringify(routes.repoInfo ?? { default_branch: "main" }),
        { status: 200 },
      );
    }

    return new Response("", { status: 404 });
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchChangelog", () => {
  it("returns unknown when npm registry returns 404", async () => {
    mockFetch({});
    const result = await fetchChangelog("my-package", "1.0.0", "2.0.0");
    expect(result).toEqual({ status: "unknown" });
  });

  it("returns unknown when npm packument has no repository or homepage", async () => {
    mockFetch({ npmPackument: { versions: { "2.0.0": {} } } });
    const result = await fetchChangelog("my-package", "1.0.0", "2.0.0");
    expect(result).toEqual({ status: "unknown" });
  });

  it("returns unknown when repo is not hosted on GitHub", async () => {
    mockFetch({
      npmPackument: makePackument("https://gitlab.com/owner/myrepo"),
    });
    const result = await fetchChangelog("my-package", "1.0.0", "2.0.0");
    expect(result).toEqual({ status: "unknown" });
  });

  it("returns found with github_releases source when releases are available", async () => {
    mockFetch({
      npmPackument: makePackument(GITHUB_REPO_URL),
      tags: makeTags(),
      releases: makeReleases(),
      tree: makeTree(),
    });

    const result = await fetchChangelog("my-package", "1.0.0", "2.0.0");

    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.source).toBe("github_releases");
    expect(result.versions).toEqual(["2.0.0"]);
    expect(result.slices).toHaveLength(1);
    expect(result.slices[0].version).toBe("2.0.0");
  });

  it("returns found with changelog_file source when changelog file is available", async () => {
    // Content must be ≥ 100 chars — changelog-file.ts rejects shorter files
    const changelogContent = [
      "## 2.0.0",
      "",
      "Breaking changes here. This section intentionally long so it passes the 100-byte minimum check.",
      "",
      "## 1.0.0",
      "",
      "Initial release with basic functionality.",
    ].join("\n");

    mockFetch({
      npmPackument: makePackument(GITHUB_REPO_URL),
      tags: makeTags(),
      releases: [],
      tree: makeTree([{ path: "CHANGELOG.md", size: changelogContent.length }]),
      rawFile: changelogContent,
    });

    const result = await fetchChangelog("my-package", "1.0.0", "2.0.0");

    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.source).toBe("changelog_file");
    expect(result.versions).toEqual(["2.0.0"]);
    expect(result.content).toContain("Breaking changes here");
  });

  it("returns partial with compareUrl when tags exist but no content is found", async () => {
    mockFetch({
      npmPackument: makePackument(GITHUB_REPO_URL),
      tags: makeTags(),
      releases: [],
      tree: makeTree(),
    });

    const result = await fetchChangelog("my-package", "1.0.0", "2.0.0");

    expect(result.status).toBe("partial");
    if (result.status !== "partial") return;
    expect(result.compareUrl).toBe(
      `https://github.com/${OWNER}/${REPO}/compare/v1.0.0...v2.0.0`,
    );
    expect(result.source).toBe("compare_url");
  });

  it("includes slices in found result matching versions and content", async () => {
    mockFetch({
      npmPackument: makePackument(GITHUB_REPO_URL),
      tags: makeTags(),
      releases: makeReleases("breaking change detail"),
      tree: makeTree(),
    });

    const result = await fetchChangelog("my-package", "1.0.0", "2.0.0");

    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.slices.map((s) => s.version)).toEqual(result.versions);
    expect(result.content).toBe(result.slices.map((s) => s.content).join("\n\n"));
  });
});
