import { integer, pgTable, text, timestamp, uniqueIndex, uuid, vector } from "drizzle-orm/pg-core";

export const changelogChunks = pgTable("changelog_chunks", {
  id: uuid().primaryKey().defaultRandom(),
  packageName: text("package_name").notNull(),
  fromVersion: text("from_version").notNull(),
  toVersion: text("to_version").notNull(),
  version: text("version").notNull(),
  content: text("content").notNull(),
  source: text("source").notNull(),
  changelogEmbedding: vector('changelog_embedding', { dimensions: 1024 }).notNull(),
  chunkIndex: integer().notNull(),
  startOffset: integer("start_offset").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("changelog_chunks_unique_chunk").on(
    t.packageName, t.fromVersion, t.toVersion, t.version, t.startOffset,
  ),
]);
