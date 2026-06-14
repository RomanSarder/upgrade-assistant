import { and, eq, gt, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import semver from "semver";
import { changelogChunks } from "../db/schema/changelog-chunks";
import type { ChangelogResult, ContentSlice } from "./types";

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
    );

  if (rows.length === 0) return null;

  rows.sort((a, b) => semver.rcompare(a.version, b.version) ?? 0);
  const source = rows[0].source as "github_releases" | "changelog_file";
  const slices: ContentSlice[] = rows.map((r) => ({ version: r.version, content: r.content }));

  return {
    status: "found",
    content: slices.map((s) => s.content).join("\n\n"),
    source,
    versions: slices.map((s) => s.version),
    slices,
  };
}

export async function insertChunks(
  db: PostgresJsDatabase<any>,
  packageName: string,
  fromVersion: string,
  toVersion: string,
  slices: ContentSlice[],
  source: string,
): Promise<void> {
  await db.insert(changelogChunks).values(
    slices.map((s) => ({
      packageName,
      fromVersion,
      toVersion,
      version: s.version,
      content: s.content,
      source,
    })),
  );
}
