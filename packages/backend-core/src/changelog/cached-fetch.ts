import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { ChangelogResult } from "./types";
import { fetchChangelog } from "./fetch";
import { findCached, insertChunks } from "./repository";
import { chunkAndEmbed } from "./embeddings";
import { cleanChangelog } from "./clean-changelog";

export async function fetchChangelogWithCache(
  db: PostgresJsDatabase<any>,
  packageName: string,
  fromVersion: string,
  toVersion: string,
): Promise<ChangelogResult & { cacheHit: boolean }> {
  const cached = await findCached(db, packageName, fromVersion, toVersion);
  if (cached) return { ...cached, cacheHit: true };

  const result = await fetchChangelog(packageName, fromVersion, toVersion);

  if (result.status === "found") {
    const cleanedSlices = result.slices.map(s => ({ ...s, content: cleanChangelog(s.content) }));
    const chunks = await chunkAndEmbed(cleanedSlices);
    await insertChunks(db, packageName, fromVersion, toVersion, chunks, result.source);
    return { ...result, slices: cleanedSlices, content: cleanedSlices.map(s => s.content).join("\n\n"), cacheHit: false };
  }

  return { ...result, cacheHit: false };
}
