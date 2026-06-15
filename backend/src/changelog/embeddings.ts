import Anthropic from "@anthropic-ai/sdk";
import { VoyageAIClient } from "voyageai";
import type { ContentSlice } from "./types";

export type EmbeddedChunk = { version: string; content: string; startOffset: number; embedding: number[] };

const CHUNK_OVERLAP = 25; // tokens

const EMBED_BATCH_SIZE = 128;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function splitIntoChunks(
  text: string,
  chunkSize = 256,
  overlap = CHUNK_OVERLAP,
): Promise<{ text: string; startOffset: number }[]> {
  if (text.length === 0) return [];
  if (overlap >= chunkSize) throw new Error(`overlap (${overlap}) must be less than chunkSize (${chunkSize})`);

  const { input_tokens } = await anthropic.messages.countTokens({
    model: "claude-haiku-4-5",
    messages: [{ role: "user", content: text }],
  });
  const charsPerToken = text.length / input_tokens;
  const result: { text: string; startOffset: number }[] = [];
  let tokenStart = 0;
  while (tokenStart < input_tokens) {
    const tokenEnd = Math.min(input_tokens, tokenStart + chunkSize);
    const startChar = Math.round(tokenStart * charsPerToken);
    const endChar = Math.min(text.length, Math.round(tokenEnd * charsPerToken));
    result.push({ text: text.slice(startChar, endChar), startOffset: startChar });
    tokenStart += chunkSize - overlap;
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
