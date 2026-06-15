import { VoyageAIClient } from "voyageai";
import type { ContentSlice } from "./types";

export type EmbeddedChunk = { version: string; content: string; startOffset: number; embedding: number[] };

// Level 2: sections exceeding this character count are split further
const LEVEL2_MAX_CHARS = 1500;
// Level 3: fallback chunk size and overlap for pure prose
const LEVEL3_CHUNK_SIZE = 1000;
const LEVEL3_OVERLAP = 100;
// Only ## and ### trigger structural splitting; # is document title, #### is too fine-grained
const SECTION_HEADER_RE = /^#{2,3} /;
const LIST_ITEM_RE = /^[-*] /;

const EMBED_BATCH_SIZE = 128;

type Chunk = { text: string; startOffset: number };

// Level 3: character sliding window with overlap — last resort for prose with no structural markers.
// The 100-char overlap preserves sentence context across chunk boundaries.
function splitProse(text: string, baseOffset = 0): Chunk[] {
  if (text.length === 0) return [];
  if (text.length <= LEVEL3_CHUNK_SIZE) {
    return [{ text, startOffset: baseOffset }];
  }
  const step = LEVEL3_CHUNK_SIZE - LEVEL3_OVERLAP;
  const result: Chunk[] = [];
  for (let start = 0; start < text.length; start += step) {
    result.push({ text: text.slice(start, start + LEVEL3_CHUNK_SIZE), startOffset: baseOffset + start });
  }
  return result;
}

// Level 2: split an oversized section at list-item boundaries — list items are atomic, never cut mid-item.
// The original section header is repeated in every sub-chunk (with "part N of M") so retrieval context is preserved.
function splitOnListBoundaries(header: string, body: string, bodyOffset: number): Chunk[] {
  const lines = body.split("\n");

  // Group lines into list-item blocks: a new block starts at each top-level list marker.
  const blocks: { text: string; offset: number }[] = [];
  let current = "";
  let currentOffset = bodyOffset;
  let cursor = bodyOffset;

  for (const line of lines) {
    const lineWithNewline = line + "\n";
    if (LIST_ITEM_RE.test(line) && current.length > 0) {
      // Discard whitespace-only preamble (the blank line between a header and first item)
      if (current.trim().length > 0) blocks.push({ text: current, offset: currentOffset });
      current = lineWithNewline;
      currentOffset = cursor;
    } else {
      if (current.length === 0) currentOffset = cursor;
      current += lineWithNewline;
    }
    cursor += lineWithNewline.length;
  }
  if (current.trim().length > 0) blocks.push({ text: current, offset: currentOffset });
  if (blocks.length === 0) return splitProse(body, bodyOffset);

  // Bin blocks into sub-chunks that stay within LEVEL2_MAX_CHARS.
  const subChunks: { lines: string; offset: number }[] = [];
  let bin = "";
  let binOffset = blocks[0].offset;
  const headerOverhead = header.length + 20; // " (part N of M)\n"
  for (const block of blocks) {
    if (bin.length > 0 && bin.length + block.text.length + headerOverhead > LEVEL2_MAX_CHARS) {
      subChunks.push({ lines: bin, offset: binOffset });
      bin = block.text;
      binOffset = block.offset;
    } else {
      if (bin.length === 0) binOffset = block.offset;
      bin += block.text;
    }
  }
  if (bin.trim().length > 0) subChunks.push({ lines: bin, offset: binOffset });

  const m = subChunks.length;
  return subChunks.map(({ lines, offset }, i) => ({
    text: `${header} (part ${i + 1} of ${m})\n${lines}`,
    startOffset: offset,
  }));
}

// Level 1: split on ## / ### headers — each section is a semantically complete unit, ideal for retrieval.
// Falls back to Level 2 for oversized sections with list items, or Level 3 for prose-only oversized sections.
export async function splitIntoChunks(text: string): Promise<Chunk[]> {
  if (text.length === 0) return [];

  const lines = text.split("\n");
  // Collect sections: { header, body, startOffset }
  const sections: { header: string; body: string; startOffset: number }[] = [];
  let currentHeader = "";
  let currentBody = "";
  let currentOffset = 0;
  let cursor = 0;

  for (const line of lines) {
    const lineWithNewline = line + "\n";
    if (SECTION_HEADER_RE.test(line)) {
      if (currentHeader !== "" || currentBody.trim() !== "") {
        sections.push({ header: currentHeader, body: currentBody, startOffset: currentOffset });
      }
      currentHeader = line;
      currentBody = "";
      currentOffset = cursor;
    } else {
      currentBody += lineWithNewline;
    }
    cursor += lineWithNewline.length;
  }
  if (currentHeader !== "" || currentBody.trim() !== "") {
    sections.push({ header: currentHeader, body: currentBody, startOffset: currentOffset });
  }

  // No ## / ### headers found — fall straight to Level 3 prose splitting
  if (sections.length === 0 || (sections.length === 1 && sections[0].header === "")) {
    return splitProse(text, 0);
  }

  const result: Chunk[] = [];
  for (const { header, body, startOffset } of sections) {
    // Strip the one trailing \n always appended by the line-accumulation loop (phantom for the
    // last section; for middle sections it removes the inter-section blank line, which is fine
    // for embedding purposes and keeps size checks accurate).
    const trimmedBody = body.replace(/\n$/, "");
    const full = header ? `${header}\n${trimmedBody}` : trimmedBody;
    if (full.length <= LEVEL2_MAX_CHARS) {
      result.push({ text: full, startOffset });
    } else if (trimmedBody.split("\n").some(l => LIST_ITEM_RE.test(l))) {
      // Level 2: oversized section that contains list items
      // +1 for the \n after header; no offset when header is empty (no header line present)
      const bodyOffset = startOffset + (header ? header.length + 1 : 0);
      result.push(...splitOnListBoundaries(header, trimmedBody, bodyOffset));
    } else {
      // Level 3 fallback: oversized prose section with no list structure
      result.push(...splitProse(full, startOffset));
    }
  }
  return result;
}

const voyage = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY });

export async function embed(values: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];
  for (let i = 0; i < values.length; i += EMBED_BATCH_SIZE) {
    const batch = values.slice(i, i + EMBED_BATCH_SIZE);
    const response = await voyage.embed({ model: 'voyage-3', input: batch });
    if (!response.data || response.data.length !== batch.length) {
      throw new Error(`VoyageAI returned ${response.data?.length ?? 0} embeddings for ${batch.length} inputs`);
    }
    embeddings.push(...response.data.map(d => {
      if (!d.embedding) throw new Error('VoyageAI returned a null embedding');
      return d.embedding;
    }));
  }
  return embeddings;
}

export async function chunkAndEmbed(slices: ContentSlice[]): Promise<EmbeddedChunk[]> {
  const pairs: { version: string; text: string; startOffset: number }[] = [];

  for (const slice of slices) {
    for (const { text, startOffset } of await splitIntoChunks(slice.content)) {
      pairs.push({ version: slice.version, text, startOffset });
    }
  }

  if (pairs.length === 0) return [];

  const embeddings = await embed(pairs.map((p) => p.text));

  return pairs.map((p, i) => ({
    version: p.version,
    content: p.text,
    startOffset: p.startOffset,
    embedding: embeddings[i],
  }));
}
