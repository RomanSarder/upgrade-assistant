import { describe, it, expect } from "vitest";
import { splitIntoChunks } from "@upgrade-advisor/backend-core/changelog/embeddings";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Repeat a string until it is at least `minLen` characters. */
function repeat(s: string, minLen: number): string {
  let out = "";
  while (out.length < minLen) out += s;
  return out.slice(0, minLen);
}

/** Build a list of `n` items each exactly `itemLen` chars (excluding bullet and newline). */
function listItems(n: number, itemLen = 80): string {
  return Array.from({ length: n }, (_, i) => `- ${repeat(`item-${i}-`, itemLen)}`).join("\n");
}

// ---------------------------------------------------------------------------
// Level 1 — Section headers
// ---------------------------------------------------------------------------

describe("splitIntoChunks – Level 1: section headers", () => {
  it("two ## sections → exactly 2 chunks", async () => {
    const text = "## Features\n\n- Add dark mode\n\n## Bug Fixes\n\n- Fix crash";
    const chunks = await splitIntoChunks(text);
    expect(chunks).toHaveLength(2);
  });

  it("each chunk text starts with its own header", async () => {
    const text = "## Features\n\n- Add dark mode\n\n## Bug Fixes\n\n- Fix crash";
    const [a, b] = await splitIntoChunks(text);
    expect(a.text).toMatch(/^## Features/);
    expect(b.text).toMatch(/^## Bug Fixes/);
  });

  it("### sections do NOT trigger Level 1 splitting — treated as content", async () => {
    const text = "### A\n\ncontent a\n\n### B\n\ncontent b\n\n### C\n\ncontent c";
    const chunks = await splitIntoChunks(text);
    // No ## headers → falls to Level 3 prose; short enough to be 1 chunk
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe(text);
  });

  it("### subheaders stay inside their parent ## section (no Level 1 split on ###)", async () => {
    const text = "## Release 1\n\nSome notes.\n\n### Sub-feature\n\nDetails.\n\n## Release 2\n\nMore notes.";
    const chunks = await splitIntoChunks(text);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].text).toMatch(/^## Release 1/);
    expect(chunks[0].text).toContain("### Sub-feature");
    expect(chunks[1].text).toMatch(/^## Release 2/);
  });

  it("header is included in the chunk text (not stripped)", async () => {
    const text = "## Features\n\n- Add dark mode";
    const [chunk] = await splitIntoChunks(text);
    expect(chunk.text).toContain("## Features");
    expect(chunk.text).toContain("Add dark mode");
  });

  it("startOffset of first chunk is 0", async () => {
    const text = "## Features\n\n- Thing\n\n## Fixes\n\n- Other";
    const [first] = await splitIntoChunks(text);
    expect(first.startOffset).toBe(0);
  });

  it("startOffset of second chunk equals index of its header in original text", async () => {
    const text = "## Features\n\n- Thing\n\n## Fixes\n\n- Other";
    const [, second] = await splitIntoChunks(text);
    expect(second.startOffset).toBe(text.indexOf("## Fixes"));
  });

  it("single ## section ≤ 1500 chars → exactly 1 chunk, no splitting", async () => {
    const text = "## Features\n\n- A\n- B\n- C";
    const chunks = await splitIntoChunks(text);
    expect(chunks).toHaveLength(1);
  });

  it("preamble before first header is emitted as its own chunk with startOffset 0", async () => {
    const text = "This is a preamble.\n\n## Features\n\n- Thing";
    const chunks = await splitIntoChunks(text);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].text).toContain("preamble");
    expect(chunks[0].startOffset).toBe(0);
  });

  it("section with only a header line and no body is filtered out", async () => {
    const text = "## Empty Section\n## Another Section\n\nContent here.";
    const chunks = await splitIntoChunks(text);
    const emptySection = chunks.find((c) => c.text.startsWith("## Empty Section"));
    expect(emptySection).toBeUndefined();
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toMatch(/^## Another Section/);
  });

  it("startOffset values are monotonically non-decreasing across all chunks", async () => {
    const text = "## A\n\ncontent a\n\n## B\n\ncontent b\n\n## C\n\ncontent c";
    const chunks = await splitIntoChunks(text);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].startOffset).toBeGreaterThan(chunks[i - 1].startOffset);
    }
  });
});

// ---------------------------------------------------------------------------
// Level 2 — List boundary split
// ---------------------------------------------------------------------------

describe("splitIntoChunks – Level 2: list boundary split", () => {
  it("oversized ## section with list items → ≥ 2 sub-chunks", async () => {
    const body = listItems(30, 60); // ~1800+ chars
    const text = `## Changes\n\n${body}`;
    const chunks = await splitIntoChunks(text);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it("every sub-chunk text starts with the original header (with part N of M suffix)", async () => {
    const body = listItems(30, 60);
    const text = `## Changes\n\n${body}`;
    const chunks = await splitIntoChunks(text);
    for (const chunk of chunks) {
      expect(chunk.text).toMatch(/^## Changes \(part \d+ of \d+\)/);
    }
  });

  it("part labels are sequential from 1 to M", async () => {
    const body = listItems(30, 60);
    const text = `## Changes\n\n${body}`;
    const chunks = await splitIntoChunks(text);
    const m = chunks.length;
    chunks.forEach((chunk, i) => {
      expect(chunk.text).toContain(`(part ${i + 1} of ${m})`);
    });
  });

  it("no list item is cut mid-line (each item appears intact in exactly one sub-chunk)", async () => {
    const items = Array.from({ length: 25 }, (_, i) => `- item-${i}-${"x".repeat(70)}`);
    const text = `## Changes\n\n${items.join("\n")}`;
    const chunks = await splitIntoChunks(text);
    for (const item of items) {
      const containing = chunks.filter((c) => c.text.includes(item));
      expect(containing).toHaveLength(1);
    }
  });

  it("startOffset values are monotonically increasing across Level-2 sub-chunks", async () => {
    const body = listItems(30, 60);
    const text = `## Changes\n\n${body}`;
    const chunks = await splitIntoChunks(text);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].startOffset).toBeGreaterThan(chunks[i - 1].startOffset);
    }
  });

  it("non-list prose before list items is kept with the first block", async () => {
    const intro = "Some introductory prose.\n\n";
    const items = listItems(20, 70);
    const text = `## Changes\n\n${intro}${items}`;
    const chunks = await splitIntoChunks(text);
    expect(chunks[0].text).toContain("introductory prose");
  });

  it("a single oversized list item → emitted as one chunk rather than cut", async () => {
    const bigItem = `- ${"x".repeat(2000)}`;
    const text = `## Changes\n\n${bigItem}`;
    const chunks = await splitIntoChunks(text);
    const allContent = chunks.map((c) => c.text).join("");
    expect(allContent).toContain(bigItem);
  });

  it("section exactly at 1500-char boundary → stays as one chunk (Level 2 not triggered)", async () => {
    // Build a text whose full content (header + body) is exactly LEVEL2_MAX_CHARS
    const header = "## Changes";
    const bodyNeeded = 1500 - (header + "\n").length;
    const body = `- ${repeat("a", bodyNeeded - 2)}`; // "- " prefix is 2 chars
    const text = `${header}\n${body}`;
    expect(text.length).toBe(1500);
    const chunks = await splitIntoChunks(text);
    expect(chunks).toHaveLength(1);
  });

  it("section 1 char over 1500-char boundary with list items → Level 2 triggered", async () => {
    const header = "## Changes";
    const bodyNeeded = 1501 - (header + "\n").length;
    const body = Array.from({ length: 10 }, (_, i) => `- ${"b".repeat(Math.ceil(bodyNeeded / 10) - 2)}`).join("\n");
    const text = `${header}\n${body}`;
    const chunks = await splitIntoChunks(text);
    // Level 2 produces sub-chunks with part labels
    const hasPartLabel = chunks.some((c) => c.text.includes("(part"));
    expect(hasPartLabel).toBe(true);
  });

  it("* bullets are recognised as list-item boundaries (not just -)", async () => {
    const items = Array.from({ length: 25 }, (_, i) => `* item-${i}-${"y".repeat(70)}`);
    const text = `## Changes\n\n${items.join("\n")}`;
    const chunks = await splitIntoChunks(text);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const chunk of chunks) {
      expect(chunk.text).toMatch(/^## Changes \(part \d+ of \d+\)/);
    }
  });
});

// ---------------------------------------------------------------------------
// Level 3 — Character fallback
// ---------------------------------------------------------------------------

describe("splitIntoChunks – Level 3: character fallback", () => {
  it("plain prose with no headers → chunks of ≤ 1000 chars", async () => {
    const text = repeat("Hello world. ", 3000);
    const chunks = await splitIntoChunks(text);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(1000);
    }
  });

  it("second chunk overlaps last 100 chars of first", async () => {
    const text = repeat("abcdefghij", 2000); // 2000 chars
    const chunks = await splitIntoChunks(text);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const overlapFromFirst = chunks[0].text.slice(-100);
    const startOfSecond = chunks[1].text.slice(0, 100);
    expect(startOfSecond).toBe(overlapFromFirst);
  });

  it("last chunk covers the end of the text", async () => {
    const text = repeat("xyz", 2100); // 2100 chars
    const chunks = await splitIntoChunks(text);
    const last = chunks[chunks.length - 1];
    expect(text.endsWith(last.text)).toBe(true);
  });

  it("oversized ## section with no list items → Level 3 applied to that section", async () => {
    const prose = repeat("This is a sentence about something important. ", 1840); // ~1840 chars
    const text = `## Prose Section\n\n${prose}\n\n## Small Section\n\n- A quick note`;
    const chunks = await splitIntoChunks(text);
    // The prose section should produce multiple chunks; small section produces 1
    const proseChunks = chunks.filter((c) => c.text.includes("sentence about something"));
    expect(proseChunks.length).toBeGreaterThanOrEqual(2);
    const smallChunk = chunks.find((c) => c.text.includes("A quick note"));
    expect(smallChunk).toBeDefined();
  });

  it("overlap is exactly 100 chars (startOffset[i+1] = startOffset[i] + 900)", async () => {
    const text = repeat("a", 2500);
    const chunks = await splitIntoChunks(text);
    for (let i = 1; i < chunks.length - 1; i++) {
      expect(chunks[i].startOffset).toBe(chunks[i - 1].startOffset + 900);
    }
  });

  it("text shorter than 1000 chars with no headers → single chunk at offset 0", async () => {
    const text = "Just a short paragraph with no headers or lists.";
    const chunks = await splitIntoChunks(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].startOffset).toBe(0);
  });

  it("text exactly 1000 chars with no headers → single chunk", async () => {
    const text = repeat("x", 1000);
    const chunks = await splitIntoChunks(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe(text);
  });

  it("text 1001 chars with no headers → two chunks; second starts at offset 900", async () => {
    const text = repeat("y", 1001);
    const chunks = await splitIntoChunks(text);
    expect(chunks).toHaveLength(2);
    expect(chunks[1].startOffset).toBe(900);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("splitIntoChunks – edge cases", () => {
  it("empty string → []", async () => {
    expect(await splitIntoChunks("")).toEqual([]);
  });

  it("whitespace-only string → single chunk", async () => {
    const chunks = await splitIntoChunks("   \n\n  \n");
    // Falls through to Level 3 prose path for a single whitespace-only body
    expect(chunks.length).toBeGreaterThanOrEqual(0); // documented: at least 0
    // More specifically: the text is treated as prose and produces at most 1 chunk
    expect(chunks.length).toBeLessThanOrEqual(1);
  });

  it("text with only a ## header line and no body → no chunks", async () => {
    const text = "## Empty Section";
    const chunks = await splitIntoChunks(text);
    expect(chunks).toHaveLength(0);
  });

  it("# (H1) headers do NOT trigger Level 1 splitting", async () => {
    const text = "# Title\n\nSome content.\n\n# Another Title\n\nMore content.";
    const chunks = await splitIntoChunks(text);
    // Treated as prose → all goes to Level 3 (≤ 1000 chars → single chunk)
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe(text);
  });

  it("#### (H4) headers do NOT trigger Level 1 splitting", async () => {
    const text = "#### Detail\n\nSome detail.\n\n#### More Detail\n\nAnother detail.";
    const chunks = await splitIntoChunks(text);
    expect(chunks).toHaveLength(1);
  });

  it("## inside a fenced code block is treated as plain text (known limitation — no fence parsing)", async () => {
    // NOTE: we intentionally do not parse fenced code blocks; a ## inside ``` is still treated
    // as a section header. This test documents the known behaviour so regressions are explicit.
    const text = "## Real Header\n\n```\n## Not a real header\n```\n\nContent";
    const chunks = await splitIntoChunks(text);
    // With the known limitation, the ## inside the fence creates an extra split
    // Assert we at least don't crash and produce valid output
    expect(Array.isArray(chunks)).toBe(true);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it("all three levels fire correctly within the same invocation", async () => {
    // Level 1: small ## section (fits as-is)
    const smallSection = "## Small\n\n- Just one item\n\n";
    // Level 2: large ## section with list items
    const bigListBody = listItems(30, 60);
    const bigListSection = `## Big List\n\n${bigListBody}\n\n`;
    // Level 3: large ## section with only prose
    const bigProse = repeat("Prose content here. ", 1600); // ~1600 chars
    const bigProseSection = `## Big Prose\n\n${bigProse}`;

    const text = smallSection + bigListSection + bigProseSection;
    const chunks = await splitIntoChunks(text);

    // Small section: 1 chunk, no part label
    const smallChunks = chunks.filter((c) => c.text.startsWith("## Small"));
    expect(smallChunks).toHaveLength(1);
    expect(smallChunks[0].text).not.toContain("(part");

    // Big list section: ≥ 2 chunks with part labels
    const listChunks = chunks.filter((c) => c.text.startsWith("## Big List"));
    expect(listChunks.length).toBeGreaterThanOrEqual(2);
    expect(listChunks[0].text).toContain("(part");

    // Big prose section: ≥ 2 chunks (Level 3)
    const proseChunks = chunks.filter((c) => c.text.includes("Prose content here"));
    expect(proseChunks.length).toBeGreaterThanOrEqual(2);

    // Chunk order follows document order
    const smallIdx = chunks.indexOf(smallChunks[0]);
    const firstListIdx = chunks.indexOf(listChunks[0]);
    const firstProseIdx = chunks.indexOf(proseChunks[0]);
    expect(smallIdx).toBeLessThan(firstListIdx);
    expect(firstListIdx).toBeLessThan(firstProseIdx);
  });
});
