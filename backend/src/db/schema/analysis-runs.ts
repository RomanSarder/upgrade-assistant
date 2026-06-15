import { pgTable, text, doublePrecision, bigint, timestamp } from "drizzle-orm/pg-core";

export const analysisRuns = pgTable("analysis_runs", {
  jobId: text("job_id").primaryKey(),
  repoId: text("repo_id").notNull(),
  costUsd: doublePrecision("cost_usd"),
  tokensUsed: bigint("tokens_used", { mode: "number" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
