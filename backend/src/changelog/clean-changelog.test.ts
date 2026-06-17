import { describe, it, expect } from "vitest";
import { cleanChangelog } from "@upgrade-advisor/backend-core/changelog/clean-changelog";

// ---------------------------------------------------------------------------
// Filter 1 – junk section removal
// ---------------------------------------------------------------------------

describe("cleanChangelog – Filter 1: junk section removal", () => {
  it("removes a ## Contributors section", () => {
    const input = [
      "## Changes",
      "",
      "- Fixed a bug",
      "",
      "## Contributors",
      "",
      "- Alice",
      "- Bob",
    ].join("\n");

    const result = cleanChangelog(input);

    expect(result).toContain("## Changes");
    expect(result).toContain("Fixed a bug");
    expect(result).not.toContain("## Contributors");
    expect(result).not.toContain("Alice");
  });

  it("removes a ## Acknowledgements section", () => {
    const input = [
      "## v1.0.0",
      "",
      "Some release notes.",
      "",
      "## Acknowledgements",
      "",
      "Thanks everyone.",
    ].join("\n");

    const result = cleanChangelog(input);

    expect(result).toContain("## v1.0.0");
    expect(result).not.toContain("## Acknowledgements");
    expect(result).not.toContain("Thanks everyone.");
  });

  it("removes a ### Thanks to section", () => {
    const input = [
      "## v2.0.0",
      "",
      "Breaking changes.",
      "",
      "### Thanks to",
      "",
      "- Carol",
    ].join("\n");

    const result = cleanChangelog(input);

    expect(result).toContain("Breaking changes.");
    expect(result).not.toContain("### Thanks to");
    expect(result).not.toContain("Carol");
  });

  it("removes a #### Special Thanks section", () => {
    const input = [
      "## Release",
      "",
      "Details here.",
      "",
      "#### Special Thanks",
      "",
      "Dave helped a lot.",
    ].join("\n");

    const result = cleanChangelog(input);

    expect(result).toContain("Details here.");
    expect(result).not.toContain("#### Special Thanks");
    expect(result).not.toContain("Dave helped a lot.");
  });

  it("does not strip a version header that contains a keyword mid-title", () => {
    const input = [
      "## v2.0.0 - Special thanks for our first stable release",
      "",
      "- Breaking change",
    ].join("\n");

    const result = cleanChangelog(input);

    expect(result).toContain("## v2.0.0");
    expect(result).toContain("Breaking change");
  });

  it("removes a ## New Contributors section (GitHub auto-generated)", () => {
    const input = [
      "## Changes",
      "",
      "- Fix",
      "",
      "## New Contributors",
      "",
      "- [Alice](https://github.com/alice)",
    ].join("\n");

    const result = cleanChangelog(input);

    expect(result).toContain("Fix");
    expect(result).not.toContain("## New Contributors");
    expect(result).not.toContain("Alice");
  });

  it("matches junk headers case-insensitively", () => {
    const upper = [
      "## Changes",
      "",
      "- Fix",
      "",
      "## CONTRIBUTORS",
      "",
      "- Eve",
    ].join("\n");

    const mixed = [
      "## Changes",
      "",
      "- Fix",
      "",
      "## CoNtRiButOrS",
      "",
      "- Frank",
    ].join("\n");

    expect(cleanChangelog(upper)).not.toContain("## CONTRIBUTORS");
    expect(cleanChangelog(upper)).not.toContain("Eve");
    expect(cleanChangelog(mixed)).not.toContain("## CoNtRiButOrS");
    expect(cleanChangelog(mixed)).not.toContain("Frank");
  });

  it("ends the junk section when a header of equal depth appears", () => {
    const input = [
      "## Changes",
      "",
      "Good content.",
      "",
      "## Contributors",
      "",
      "- Grace",
      "",
      "## Bug Fixes",
      "",
      "More good content.",
    ].join("\n");

    const result = cleanChangelog(input);

    expect(result).toContain("Good content.");
    expect(result).not.toContain("## Contributors");
    expect(result).not.toContain("Grace");
    expect(result).toContain("## Bug Fixes");
    expect(result).toContain("More good content.");
  });

  it("ends the junk section when a shallower header appears", () => {
    const input = [
      "# v1.0.0",
      "",
      "## Features",
      "",
      "Feature content.",
      "",
      "### Contributors",
      "",
      "- Henry",
      "",
      "## Bug Fixes",
      "",
      "Bug fix content.",
    ].join("\n");

    const result = cleanChangelog(input);

    expect(result).toContain("Feature content.");
    expect(result).not.toContain("### Contributors");
    expect(result).not.toContain("Henry");
    expect(result).toContain("## Bug Fixes");
    expect(result).toContain("Bug fix content.");
  });

  it("removes a junk section at the end of the file (no following header)", () => {
    const input = [
      "## Changes",
      "",
      "- Fixed something",
      "",
      "## Contributors",
      "",
      "- Ivy",
      "- Jack",
    ].join("\n");

    const result = cleanChangelog(input);

    expect(result).toContain("Fixed something");
    expect(result).not.toContain("Contributors");
    expect(result).not.toContain("Ivy");
    expect(result).not.toContain("Jack");
  });

  it("removes back-to-back junk sections", () => {
    const input = [
      "## Changes",
      "",
      "- Fix",
      "",
      "## Contributors",
      "",
      "- Karen",
      "",
      "## Acknowledgements",
      "",
      "- Lee",
      "",
      "## More Changes",
      "",
      "- Another fix",
    ].join("\n");

    const result = cleanChangelog(input);

    expect(result).toContain("## Changes");
    expect(result).not.toContain("## Contributors");
    expect(result).not.toContain("Karen");
    expect(result).not.toContain("## Acknowledgements");
    expect(result).not.toContain("Lee");
    expect(result).toContain("## More Changes");
    expect(result).toContain("Another fix");
  });

  it("preserves non-junk sections entirely", () => {
    const input = [
      "## Features",
      "",
      "- Add dark mode",
      "",
      "## Bug Fixes",
      "",
      "- Fix crash on startup",
      "",
      "## Performance",
      "",
      "- Faster builds",
    ].join("\n");

    const result = cleanChangelog(input);

    expect(result).toBe(input);
  });
});

// ---------------------------------------------------------------------------
// Filter 2 – bare link line removal
// ---------------------------------------------------------------------------

describe("cleanChangelog – Filter 2: bare link line removal", () => {
  it("removes a bare link list item using - bullet", () => {
    const input = [
      "## Changes",
      "",
      "- Fixed a bug",
      "- [Alice](https://github.com/alice)",
    ].join("\n");

    const result = cleanChangelog(input);

    expect(result).toContain("Fixed a bug");
    expect(result).not.toContain("- [Alice](https://github.com/alice)");
  });

  it("removes a bare link list item using * bullet", () => {
    const input = [
      "## Changes",
      "",
      "- Fixed a bug",
      "* [Bob](https://github.com/bob)",
    ].join("\n");

    const result = cleanChangelog(input);

    expect(result).toContain("Fixed a bug");
    expect(result).not.toContain("* [Bob](https://github.com/bob)");
  });

  it("preserves list items that contain surrounding text around a link", () => {
    const input = [
      "## Changes",
      "",
      "- Fixed [thing](https://example.com/thing) in module",
      "- See [the docs](https://docs.example.com) for details",
    ].join("\n");

    const result = cleanChangelog(input);

    expect(result).toContain("Fixed [thing](https://example.com/thing) in module");
    expect(result).toContain("See [the docs](https://docs.example.com) for details");
  });

  it("removes bare link items with leading whitespace (indented list)", () => {
    const input = [
      "## Changes",
      "",
      "- Parent item",
      "  - [Carol](https://github.com/carol)",
    ].join("\n");

    const result = cleanChangelog(input);

    expect(result).not.toContain("[Carol](https://github.com/carol)");
  });

  it("preserves bare link items whose URL has multiple path segments (PR/issue links)", () => {
    const input = [
      "## Changes",
      "",
      "- [Fix memory leak](https://github.com/org/repo/pull/123)",
      "- [Bump dependency](https://github.com/org/repo/issues/456)",
    ].join("\n");

    const result = cleanChangelog(input);

    expect(result).toContain("- [Fix memory leak](https://github.com/org/repo/pull/123)");
    expect(result).toContain("- [Bump dependency](https://github.com/org/repo/issues/456)");
  });

  it("leaves real changelog content untouched", () => {
    const input = [
      "## v3.0.0",
      "",
      "### Added",
      "",
      "- New feature A",
      "- New feature B that links to [RFC 1234](https://example.com/rfc) for context",
      "",
      "### Fixed",
      "",
      "- Bug fix for issue #42",
    ].join("\n");

    const result = cleanChangelog(input);

    expect(result).toBe(input);
  });
});

// ---------------------------------------------------------------------------
// Both filters together
// ---------------------------------------------------------------------------

describe("cleanChangelog – both filters on a realistic changelog", () => {
  it("strips junk sections and bare contributor links from a realistic changelog", () => {
    const input = [
      "# CHANGELOG",
      "",
      "## 2.1.0",
      "",
      "### Added",
      "",
      "- Support for TypeScript 5",
      "- New `parse` option",
      "",
      "### Fixed",
      "",
      "- Crash when config is missing",
      "- See [migration guide](https://docs.example.com/migrate) for details",
      "",
      "### Contributors",
      "",
      "- [Dave](https://github.com/dave)",
      "- [Eve](https://github.com/eve)",
      "",
      "## 2.0.0",
      "",
      "### Breaking Changes",
      "",
      "- Removed legacy API",
      "",
      "## Acknowledgements",
      "",
      "- [Frank](https://github.com/frank)",
      "Special thanks to everyone.",
    ].join("\n");

    const result = cleanChangelog(input);

    // Preserved content
    expect(result).toContain("# CHANGELOG");
    expect(result).toContain("## 2.1.0");
    expect(result).toContain("Support for TypeScript 5");
    expect(result).toContain("Crash when config is missing");
    expect(result).toContain("See [migration guide](https://docs.example.com/migrate) for details");
    expect(result).toContain("## 2.0.0");
    expect(result).toContain("Removed legacy API");

    // Removed by Filter 1 (junk sections)
    expect(result).not.toContain("### Contributors");
    expect(result).not.toContain("## Acknowledgements");
    expect(result).not.toContain("Special thanks to everyone.");

    // Removed by Filter 2 (bare links) — these were inside the junk section,
    // but would also be caught even if they appeared outside one
    expect(result).not.toContain("[Dave](https://github.com/dave)");
    expect(result).not.toContain("[Eve](https://github.com/eve)");
    expect(result).not.toContain("[Frank](https://github.com/frank)");
  });
});
