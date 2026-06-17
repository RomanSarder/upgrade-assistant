import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const upgradeRecommendations = pgTable("upgrade_recommendations", {
  id: uuid().primaryKey().defaultRandom(),
  runId: text("run_id").notNull(),
  repoId: text("repo_id"),
  packageName: text("package_name").notNull(),
  fromVersion: text("from_version").notNull(),
  toVersion: text("to_version").notNull(),
  riskLevel: text("risk_level").notNull(),
  breakingChanges: text("breaking_changes"),
  changelogSectionsUsed: text("changelog_sections_used").array(),
  reasoning: text("reasoning"),
  recommendation: text("recommendation"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
