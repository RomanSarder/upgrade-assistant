# Changelog discovery

Given an npm package name and a version range, `fetchChangelog` finds and returns the human-readable changelog for that range.

## How it works

First we hit the npm registry to find the package's GitHub repo. Then we look up its git tags to anchor the range — if we find both, we can build a GitHub compare URL as a fallback.

The interesting part is how we get the actual content. Repos don't agree on where changelogs live. Some maintainers write detailed GitHub Releases for every version. Others keep a single `CHANGELOG.md` and never touch the Releases tab. So we try both in parallel and pick whichever has more to say. Draft releases are excluded.

There's one exception: monorepos. When a package lives in a subdirectory, GitHub Releases usually cover the whole repo — tags and notes mixed across every package in the tree. The CHANGELOG file scoped to that subdirectory is almost always more useful, so we prefer it.

**Finding the CHANGELOG file**

Not every repo names it the same way. We look for files whose basename (case-insensitive, any depth) is one of: `changelog`, `changes`, `history`, `release`, `news`, or `releases`, with an extension of `.md`, `.markdown`, `.txt`, or none. Files with `.sh` or `.json` extensions are rejected. Size must be 100–1 000 000 bytes.

Candidates are scored so that name matters more than extension — `CHANGELOG.md` always beats `HISTORY.txt`. We fetch the top 5 in parallel and iterate them in priority order, taking the first one that both parses cleanly and contains the target version string. If none mention the version, we fall back to the first that parses at all. GitHub's tree API truncates responses at 100 000 entries; in that edge case we warn and continue with whatever came back.

## GitHub API

All requests use GitHub API version 2022-11-28. If `GITHUB_TOKEN` is set in the environment it is sent as a Bearer token; without it, requests are unauthenticated and subject to lower rate limits.

On a 403 or 429 response we read the `Retry-After` header (integer seconds or HTTP-date string) and wait that long, capped at 60 seconds, then retry once. If the retry still hits the limit we throw.

Tag and release fetches follow GitHub's link-header pagination (100 items per page) so large repos with thousands of tags don't get silently truncated.

## Changelog pre-processing (`cleanChangelog`)

Before chunking, the raw changelog string is passed through `cleanChangelog` (in `clean-changelog.ts`), which applies two best-effort filters. Changelog formats are not standardised, so these are heuristics rather than guarantees.

**Filter 1 — Junk section removal**

Strips entire markdown sections whose header (`##` or deeper) contains a known noise keyword — `Contributors`, `New contributors`, `All contributors`, `Acknowledgements`, `Thanks to`, or `Special thanks` — matched case-insensitively. The section is removed from its header line through to (but not including) the next header of equal or lesser depth. This eliminates long contributor credit blocks that would otherwise pollute embeddings with names and GitHub URLs.

**Filter 2 — Bare contributor link lines**

After the section filter, removes any remaining list item (`-` or `*`) whose entire content is a single markdown link `[text](url)` with no surrounding text. This catches contributor lists that appear inline without a dedicated header (e.g. "All Contributors" badge rows).

**Decision rationale:** contributor content is high-noise, low-signal for the upgrade-advisor use case. A user querying "what breaking changes landed in v2?" should not get back a chunk of maintainer names. Keeping the filters in a separate exported function makes them independently unit-testable.

## Chunking (`splitIntoChunks`)

After cleaning, each version's content is split into chunks for embedding. The splitter in `embeddings.ts` works in three levels, falling through to the next only when the previous isn't enough.

**Level 1 — Section headers**

Splits on `##` headers. Each section — header plus its body — becomes one chunk. `###` and deeper are left as content within their parent section: splitting on them produces orphan header chunks that score well in retrieval but carry no signal. `#` is the document title. Most changelog content fits comfortably inside a single `##` section, so this level handles the majority of cases.

**Level 2 — List boundaries**

When a section exceeds 1 500 characters and its body contains list items, the section is split at top-level list-item boundaries (`-` or `*`). Items are never cut mid-line. The original section header is repeated at the top of every sub-chunk with a `(part N of M)` suffix so that retrieval context is preserved even when only one sub-chunk is returned.

**Level 3 — Character sliding window**

When an oversized section has no list structure (pure prose), it falls back to a 1 000-character sliding window with 100 characters of overlap. The overlap keeps sentence context intact across chunk boundaries. This level also handles text that has no `##` headers at all — the entire content is treated as a single prose block.

**Reconstruction**

`findCached` reassembles chunks back into full section text using the `startOffset` stored alongside each chunk. The `(part N of M)` label on the first sub-chunk's header is stripped before the pieces are stitched together, so callers receive clean markdown.

**Embedding**

Chunks are embedded using VoyageAI (`voyage-3`), batched at 128 texts per API request.

## Caching (`fetchChangelogWithCache`)

`fetchChangelogWithCache` wraps the core flow with a 7-day database cache keyed on package name and version range. On a hit, it returns the reconstructed result immediately. On a miss, it fetches, cleans, chunks, embeds, and stores the result, then returns it with `cacheHit: false`. Only `found` results are stored; `partial` and `unknown` are returned as-is without touching the cache.

## What you get back

- `found` — content from GitHub Releases or a changelog file, with the list of versions it covers
- `partial` — no content, but we found the tags, so here's a GitHub compare URL
- `unknown` — no GitHub repo, no tags, nothing useful
