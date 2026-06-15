import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { ChangelogResult } from "./types";
import { fetchChangelog } from "./fetch";
import { findCached, insertChunks } from "./repository";
import { chunkAndEmbed } from "./embeddings";

export async function fetchChangelogWithCache(
  db: PostgresJsDatabase<any>,
  packageName: string,
  fromVersion: string,
  toVersion: string,
): Promise<ChangelogResult> {
  const cached = await findCached(db, packageName, fromVersion, toVersion);
  if (cached) return cached;

  const result = await fetchChangelog(packageName, fromVersion, toVersion);

  if (result.status === "found") {
    const chunks = await chunkAndEmbed(result.slices);
    await insertChunks(db, packageName, fromVersion, toVersion, chunks, result.source);
  }

  return result;
}
