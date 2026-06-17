import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const packages = pgTable("packages", {
  id: uuid().primaryKey().defaultRandom(),
  repoId: text("repo_id").notNull(),
  packageName: text("package_name").notNull(),
  fromVersion: text("from_version").notNull(),
  toVersion: text("to_version").notNull(),
  hasUpgradeAvailable: boolean("has_upgrade_available").notNull().default(false),
  isDev: boolean("is_dev").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
