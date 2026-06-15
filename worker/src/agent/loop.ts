import Anthropic from "@anthropic-ai/sdk";
import type { Logger } from "pino";
import { env } from "../env";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import Redis from "ioredis";
import { and, eq } from "drizzle-orm";
import { AGENT_TOOLS } from "@backend/agent/tools";
import { fetchChangelogWithCache } from "@backend/changelog/cached-fetch";
import { queryChangelog } from "@backend/changelog/repository";
import * as schema from "@backend/db/schema";
import { packages, upgradeRecommendations, analysisRuns } from "@backend/db/schema";

type Db = PostgresJsDatabase<typeof schema>;

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const INPUT_COST_PER_MILLION_TOKENS = 3;
const OUTPUT_COST_PER_MILLION_TOKENS = 15;

interface SynthesiseFinding {
  package: string;
  from_version: string;
  to_version: string;
  is_dev_dependency: boolean;
  breaking_changes: string;
  changelog_sections_used: string[];
  risk_level: string;
  reasoning: string;
  recommendation: string;
}

async function handleFetchChangelog(
  db: Db,
  input: { package: string; from_version: string; to_version: string },
) {
  const result = await fetchChangelogWithCache(db, input.package, input.from_version, input.to_version);
  // Return only metadata — the content is available via query_changelog. Returning
  // the full content string and slices would saturate Claude's context window for
  // large packages (hundreds of KB of changelog text).
  if (result.status === "found") {
    return { status: result.status, source: result.source, versions: result.versions };
  }
  return result;
}

async function handleQueryChangelog(
  db: Db,
  input: { package: string; from_version: string; to_version: string; question: string },
) {
  return queryChangelog(db, input.question, input.package, input.from_version, input.to_version, 5);
}

async function handleCheckNpmMetadata(input: { package: string }) {
  const encoded = encodeURIComponent(input.package);
  const [registryRes, downloadsRes] = await Promise.all([
    fetch(`https://registry.npmjs.org/${encoded}`),
    fetch(`https://api.npmjs.org/downloads/point/last-week/${encoded}`),
  ]);

  if (!registryRes.ok) throw new Error(`npm registry returned ${registryRes.status}`);
  const data = await registryRes.json() as Record<string, unknown>;

  const distTags = data["dist-tags"] as Record<string, string> | undefined;
  const latest = distTags?.latest ?? "";
  const versions = data.versions as Record<string, { deprecated?: string }> | undefined;
  const latestMeta = versions?.[latest];
  const isDeprecated = latestMeta?.deprecated !== undefined;

  const weeklyDownloads = downloadsRes.ok
    ? ((await downloadsRes.json()) as { downloads?: number }).downloads ?? null
    : null;

  const time = data.time as Record<string, string> | undefined;
  const lastPublish = latest && time ? (time[latest] ?? null) : null;

  const maintainers = (data.maintainers as Array<{ name: string }> | undefined)?.map(
    (m) => m.name,
  ) ?? [];

  return { is_deprecated: isDeprecated, weekly_downloads: weeklyDownloads, last_publish: lastPublish, maintainers };
}

async function handleSynthesiseRisk(
  db: Db,
  jobId: string,
  repoId: string,
  input: { findings: SynthesiseFinding[] },
): Promise<{ success: true; risk_levels: Record<string, string> }> {
  const riskLevels: Record<string, string> = {};

  if (input.findings.length > 0) {
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

  for (const f of input.findings) {
    riskLevels[f.package] = f.risk_level;
  }

  return { success: true, risk_levels: riskLevels };
}

async function dispatchTool(
  db: Db,
  jobId: string,
  repoId: string,
  toolName: string,
  toolInput: unknown,
  log: Logger,
): Promise<unknown> {
  const start = Date.now();
  try {
    let result: unknown;
    switch (toolName) {
      case "fetch_changelog":
        result = await handleFetchChangelog(db, toolInput as Parameters<typeof handleFetchChangelog>[1]);
        break;
      case "query_changelog":
        result = await handleQueryChangelog(db, toolInput as Parameters<typeof handleQueryChangelog>[1]);
        break;
      case "check_npm_metadata":
        result = await handleCheckNpmMetadata(toolInput as { package: string });
        break;
      case "synthesise_risk":
        result = await handleSynthesiseRisk(db, jobId, repoId, toolInput as { findings: SynthesiseFinding[] });
        break;
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
    log.info({ toolName, durationMs: Date.now() - start }, "tool call succeeded");
    return result;
  } catch (err) {
    log.warn({ err, toolName, durationMs: Date.now() - start }, "tool call failed");
    throw err;
  }
}

export async function runAgentLoop(jobId: string, repoId: string, log: Logger): Promise<void> {
  const pgClient = postgres(env.DATABASE_URL);
  const db = drizzle(pgClient, { schema });
  const publisher = new Redis(env.REDIS_URL);

  // Dedicated publisher per invocation — never shared across concurrent calls.
  // Rejected publishes are swallowed to avoid unhandled-rejection crashes;
  // Redis connectivity issues surface through missing events rather than process death.
  const emit = (event: object): Promise<void> => {
    return publisher.publish(`job:${jobId}`, JSON.stringify(event)).then(() => {}).catch(() => {});
  };

  try {
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

        const systemPrompt =
          `You are an upgrade-risk analyst. For the package "${pkg.packageName}" ` +
          `(upgrading from ${pkg.fromVersion} to ${pkg.toVersion}), use the available ` +
          `tools to assess upgrade risk. This is a ${pkg.isDev ? 'devDependency — lower runtime impact' : 'runtime dependency — affects production behaviour'}.

          Use tools in this order:
          1. fetch_changelog — retrieve changelog content for this version range
          2. query_changelog — investigate breaking changes, removed APIs, migration requirements, deprecated APIs, peer-dependency changes, and Node.js version requirements
          3. check_npm_metadata — check package health and maintenance status
          4. synthesise_risk — call this when investigation is complete with your findings and recommendation

          Risk level definitions — apply these strictly:
          - safe: no API changes; patch or security fix only; drop-in replacement
          - low: additive changes only; new optional APIs; no removed or renamed APIs
          - medium: deprecated APIs warned but not removed; behaviour changes with clear workarounds available
          - high: APIs removed or renamed; signature changes; migration steps required but documented
          - breaking: complete API overhaul; ESM-only conversion; no backwards compatibility

          Be precise. If no breaking changes are found, say safe or low — do not inflate risk. ` +
          `If changelog content is unavailable, say so explicitly and note that your assessment is based on incomplete information.`;

        const messages: Anthropic.MessageParam[] = [
          {
            role: "user",
            content: `Analyse the upgrade risk for ${pkg.packageName} from version ${pkg.fromVersion} to ${pkg.toVersion}.`,
          },
        ];

        let iteration = 0;

        while (true) {
          iteration++;
          const apiStart = Date.now();
          const response = await anthropic.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 4096,
            system: systemPrompt,
            tools: AGENT_TOOLS,
            messages,
          });
          pkgLog.info({
            model: response.model,
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            stopReason: response.stop_reason,
            durationMs: Date.now() - apiStart,
            iteration,
          }, "claude api call");

          totalInputTokens +=
            response.usage.input_tokens +
            (response.usage.cache_creation_input_tokens ?? 0) +
            (response.usage.cache_read_input_tokens ?? 0);
          totalOutputTokens += response.usage.output_tokens;

          messages.push({ role: "assistant", content: response.content });

          if (response.stop_reason === "tool_use") {
            const toolResults: Anthropic.ToolResultBlockParam[] = [];

            for (const block of response.content) {
              if (block.type !== "tool_use") continue;

              let result: unknown;
              let isError = false;

              try {
                result = await dispatchTool(db, jobId, repoId, block.name, block.input, pkgLog);

                if (block.name === "synthesise_risk") {
                  const r = result as { risk_levels?: Record<string, string> };
                  riskLevel = r.risk_levels?.[pkg.packageName] ?? riskLevel;
                  const findings = (block.input as { findings: SynthesiseFinding[] }).findings;
                  const finding = findings.find((f) => f.package === pkg.packageName) ?? findings[0];
                  breakingChanges = finding?.breaking_changes ?? null;
                }
              } catch (err) {
                isError = true;
                result = { error: String(err) };
                emit({ type: "tool_error", payload: { tool_name: block.name, error: String(err) } });
              }

              if (!isError) {
                emit({ type: "tool_call", payload: { tool_name: block.name, input: block.input, result } });
              }

              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: JSON.stringify(result),
                ...(isError ? { is_error: true } : {}),
              });
            }

            messages.push({ role: "user", content: toolResults });
          } else {
            if (response.stop_reason === "max_tokens") {
              pkgLog.warn({ outputTokens: response.usage.output_tokens, iteration }, "max_tokens reached, stopping loop");
              emit({
                type: "tool_error",
                payload: { tool_name: "agent_loop", error: "max_tokens reached before synthesise_risk was called" },
              });
            }
            break;
          }
        }
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
