// Changelog formats are not standardised — these filters are best-effort heuristics
// to strip contributor noise before embedding, so queries return change content
// rather than lists of maintainer names and GitHub URLs.

const JUNK_HEADER = /^(#{2,})\s+(?:(?:new|all)\s+)?(?:contributors?|acknowledgements?|thanks\s+to|special\s+thanks)\b/i;

// Filter 1: remove entire markdown sections whose header matches a known noise keyword.
// A section spans from its header line to (but not including) the next header of equal
// or lesser depth. Handles ##, ###, ####, etc.
function removeJunkSections(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let skipDepth: number | null = null;

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,})\s/);
    if (headerMatch) {
      const depth = headerMatch[1].length;
      if (skipDepth !== null && depth <= skipDepth) {
        skipDepth = null;
      }
      if (skipDepth === null && JUNK_HEADER.test(line)) {
        skipDepth = depth;
      }
    }
    if (skipDepth === null) {
      out.push(line);
    }
  }

  return out.join("\n");
}

// Filter 2: remove list items whose only content is a single markdown link with no
// surrounding text. Catches contributor entries that appear outside a dedicated section
// (e.g. inline "All Contributors" rows: `- [Alice](https://github.com/alice)`).
const BARE_LINK_LINE = /^\s*[-*]\s+\[[^\]]*\]\(https?:\/\/[^/)\s]+\/[^/)\s]+\)\s*$/;

function removeContributorLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => !BARE_LINK_LINE.test(line))
    .join("\n");
}

export function cleanChangelog(raw: string): string {
  return removeContributorLines(removeJunkSections(raw));
}
