# Changelog discovery

Given an npm package name and a version range, `fetchChangelog` finds and returns the human-readable changelog for that range.

## How it works

First we hit the npm registry to find the package's GitHub repo. Then we look up its git tags to anchor the range — if we find both, we can build a GitHub compare URL as a fallback.

The interesting part is how we get the actual content. Repos don't agree on where changelogs live. Some maintainers write detailed GitHub Releases for every version. Others keep a single `CHANGELOG.md` and never touch the Releases tab. So we try both in parallel and pick whichever has more to say.

There's one exception: monorepos. When a package lives in a subdirectory, GitHub Releases usually cover the whole repo — tags and notes mixed across every package in the tree. The CHANGELOG file scoped to that subdirectory is almost always more useful, so we prefer it.

## What you get back

- `found` — content from GitHub Releases or a changelog file, with the list of versions it covers
- `partial` — no content, but we found the tags, so here's a GitHub compare URL
- `unknown` — no GitHub repo, no tags, nothing useful
