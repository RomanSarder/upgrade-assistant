import { and, asc, eq, gt, sql } from "drizzle-orm";
import { cosineDistance } from "drizzle-orm/sql/functions";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import semver from "semver";
import { changelogChunks } from "../db/schema/changelog-chunks";
import type { ChangelogResult, ContentSlice } from "./types";
import type { EmbeddedChunk } from "./embeddings";
import { embed } from "./embeddings";

export async function findCached(
  db: PostgresJsDatabase<any>,
  packageName: string,
  fromVersion: string,
  toVersion: string,
): Promise<ChangelogResult | null> {
  const rows = await db
    .select()
    .from(changelogChunks)
    .where(
      and(
        eq(changelogChunks.packageName, packageName),
        eq(changelogChunks.fromVersion, fromVersion),
        eq(changelogChunks.toVersion, toVersion),
        gt(changelogChunks.fetchedAt, sql`NOW() - INTERVAL '7 days'`),
      ),
    )
    .orderBy(asc(changelogChunks.fetchedAt));

  if (rows.length === 0) return null;

  const source = rows[0].source as "github_releases" | "changelog_file";

  const byVersion = new Map<string, typeof rows>();
  for (const row of rows) {
    const group = byVersion.get(row.version) ?? [];
    group.push(row);
    byVersion.set(row.version, group);
  }

  const slices: ContentSlice[] = [...byVersion.entries()]
    .sort(([a], [b]) => {
      const av = semver.valid(a);
      const bv = semver.valid(b);
      if (av && bv) return semver.rcompare(av, bv);
      if (av) return -1;
      if (bv) return 1;
      return a.localeCompare(b);
    })
    .map(([version, group]) => {
      group.sort((a, b) => a.startOffset - b.startOffset);
      // Strip "(part N of M)" label injected into multi-part chunk headers before reconstruction.
      // currentEnd still uses the original chunk length so the offset-based strip of subsequent
      // chunk headers remains correct.
      const firstContent = group[0].content.replace(/ \(part \d+ of \d+\)/, "");
      let content = firstContent;
      let currentEnd = group[0].startOffset + group[0].content.length;
      for (const chunk of group.slice(1)) {
        const stripLen = currentEnd - chunk.startOffset;
        content += stripLen > 0 ? chunk.content.slice(stripLen) : chunk.content;
        currentEnd = chunk.startOffset + chunk.content.length;
      }
      return { version, content };
    });

  return {
    status: "found",
    content: slices.map((s) => s.content).join("\n\n"),
    source,
    versions: slices.map((s) => s.version),
    slices,
  };
}

export async function queryChangelog(
  db: PostgresJsDatabase<any>,
  query: string,
  packageName: string,
  fromVersion: string,
  toVersion: string,
  limit: number,
): Promise<ContentSlice[]> {
  if (!query.trim()) return [];
  const [queryEmbedding] = await embed([query]);

  return db
    .select({ version: changelogChunks.version, content: changelogChunks.content })
    .from(changelogChunks)
    .where(
      and(
        eq(changelogChunks.packageName, packageName),
        eq(changelogChunks.fromVersion, fromVersion),
        eq(changelogChunks.toVersion, toVersion),
        gt(changelogChunks.fetchedAt, sql`NOW() - INTERVAL '7 days'`),
      ),
    )
    .orderBy(asc(cosineDistance(changelogChunks.changelogEmbedding, queryEmbedding)))
    .limit(limit);
}

export async function insertChunks(
  db: PostgresJsDatabase<any>,
  packageName: string,
  fromVersion: string,
  toVersion: string,
  chunks: EmbeddedChunk[],
  source: string,
): Promise<void> {
  if (chunks.length === 0) return;

  const versionChunkCount = new Map<string, number>();
  await db.insert(changelogChunks).values(
    chunks.map((chunk) => {
      const idx = versionChunkCount.get(chunk.version) ?? 0;
      versionChunkCount.set(chunk.version, idx + 1);
      return {
        packageName,
        fromVersion,
        toVersion,
        version: chunk.version,
        content: chunk.content,
        startOffset: chunk.startOffset,
        changelogEmbedding: chunk.embedding,
        source,
        chunkIndex: idx,
      };
    }),
  ).onConflictDoNothing();
}
