import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const changelogChunks = pgTable("changelog_chunks", {
  id: uuid().primaryKey().defaultRandom(),
  packageName: text("package_name").notNull(),
  fromVersion: text("from_version").notNull(),
  toVersion: text("to_version").notNull(),
  version: text("version").notNull(),
  content: text("content").notNull(),
  source: text("source").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
});
