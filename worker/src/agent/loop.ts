import type { Logger } from "pino";
import { env } from "../env";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import Redis from "ioredis";
import { and, eq, sql } from "drizzle-orm";
import { runPackageAgentLoop, type SynthesiseFinding, INPUT_COST_PER_MILLION_TOKENS, OUTPUT_COST_PER_MILLION_TOKENS } from "./run-package";
import * as schema from "@backend/db/schema";
import { packages, upgradeRecommendations, analysisRuns, users } from "@backend/db/schema";

type Db = PostgresJsDatabase<typeof schema>;

const DEMO_BUDGET_USD = 2.00;

async function handleSynthesiseRisk(
  db: Db,
  jobId: string,
  repoId: string,
  input: { findings: SynthesiseFinding[] },
): Promise<void> {
  if (input.findings.length === 0) return;
  await db.insert(upgradeRecommendations).values(
    input.findings.map((f) => ({
      runId: jobId,
      repoId,
      packageName: f.package,
      fromVersion: f.from_version,
      toVersion: f.to_version,
      riskLevel: f.risk_level,
      breakingChanges: f.breaking_changes || null,
      changelogSectionsUsed: f.changelog_sections_used,
      reasoning: f.reasoning || null,
      recommendation: f.recommendation || null,
    })),
  ).onConflictDoNothing();
}

export async function runAgentLoop(jobId: string, repoId: string, userId: string, log: Logger): Promise<void> {
  const pgClient = postgres(env.DATABASE_URL);
  const db = drizzle(pgClient, { schema });
  const publisher = new Redis(env.REDIS_URL);

  const emit = (event: object): Promise<void> => {
    return publisher.publish(`job:${jobId}`, JSON.stringify(event)).then(() => {}).catch(() => {});
  };

  try {
    if (userId) {
      const [currentUser] = await db
        .select({ costUsdUsed: users.costUsdUsed })
        .from(users)
        .where(eq(users.id, userId));
      if (currentUser && Number(currentUser.costUsdUsed) >= DEMO_BUDGET_USD) {
        log.warn({ userId, costUsdUsed: currentUser.costUsdUsed }, "user over budget, skipping analysis");
        await emit({ type: "done", payload: { cost_usd: 0, tokens_used: 0 } });
        return;
      }
    }

    const pkgs = await db
      .select()
      .from(packages)
      .where(and(eq(packages.repoId, repoId), eq(packages.hasUpgradeAvailable, true)));

    log.info({ packageCount: pkgs.length }, "agent loop started");
    emit({ type: "started", payload: { total: pkgs.length } });

    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (const pkg of pkgs) {
      let riskLevel = "unknown";
      let breakingChanges: string | null = null;
      const pkgLog = log.child({ packageName: pkg.packageName, fromVersion: pkg.fromVersion, toVersion: pkg.toVersion });
      const pkgStart = Date.now();

      try {
        pkgLog.info("package analysis started");
        emit({
          type: "package_start",
          payload: {
            package: pkg.packageName,
            from_version: pkg.fromVersion,
            to_version: pkg.toVersion,
          },
        });

        const result = await runPackageAgentLoop(db, pkg, pkgLog, emit);

        riskLevel = result.riskLevel;
        breakingChanges = result.breakingChanges;
        totalInputTokens += result.inputTokens;
        totalOutputTokens += result.outputTokens;

        await handleSynthesiseRisk(db, jobId, repoId, { findings: result.findings });
      } catch (err) {
        pkgLog.error({ err }, "package analysis error");
        emit({ type: "tool_error", payload: { tool_name: "agent_loop", error: String(err) } });
      }

      pkgLog.info({ durationMs: Date.now() - pkgStart, riskLevel }, "package analysis completed");
      emit({ type: "package_done", payload: { package: pkg.packageName, risk_level: riskLevel, breaking_changes: breakingChanges } });
    }

    const totalTokens = totalInputTokens + totalOutputTokens;
    const costUsd =
      (totalInputTokens / 1_000_000) * INPUT_COST_PER_MILLION_TOKENS +
      (totalOutputTokens / 1_000_000) * OUTPUT_COST_PER_MILLION_TOKENS;

    try {
      await db
        .insert(analysisRuns)
        .values({ jobId, repoId, costUsd, tokensUsed: totalTokens })
        .onConflictDoUpdate({
          target: analysisRuns.jobId,
          set: { costUsd, tokensUsed: totalTokens },
        });
    } catch (err) {
      log.error({ err }, "failed to persist analysis run cost");
    }

    if (userId && costUsd > 0) {
      try {
        await db
          .update(users)
          .set({ costUsdUsed: sql`${users.costUsdUsed} + ${costUsd}` })
          .where(eq(users.id, userId));
      } catch (err) {
        log.error({ err }, "failed to increment user cost");
      }
    }

    await emit({
      type: "done",
      payload: { cost_usd: costUsd, tokens_used: totalTokens },
    });
    log.info({ packageCount: pkgs.length }, "agent loop completed");
  } finally {
    await pgClient.end();
    await publisher.quit();
  }
}
