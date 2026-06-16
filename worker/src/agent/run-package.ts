import Anthropic from "@anthropic-ai/sdk";
import type { Logger } from "pino";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { AGENT_TOOLS } from "@backend/agent/tools";
import { fetchChangelogWithCache } from "@backend/changelog/cached-fetch";
import { queryChangelog } from "@backend/changelog/repository";
import * as schema from "@backend/db/schema";

type Db = PostgresJsDatabase<typeof schema>;

export const INPUT_COST_PER_MILLION_TOKENS = 3;
export const OUTPUT_COST_PER_MILLION_TOKENS = 15;

export interface SynthesiseFinding {
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

export interface PackageInput {
  packageName: string;
  fromVersion: string;
  toVersion: string;
  isDev: boolean;
}

export interface PackageAnalysisResult {
  riskLevel: string;
  reasoning: string | null;
  breakingChanges: string | null;
  findings: SynthesiseFinding[];
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

export type TraceEvent =
  | { type: "changelog_discovery"; source: string; cacheHit: boolean; contentLength: number }
  | { type: "query_result"; query: string; chunks: Array<{ version: string; content: string; distance: number }> }
  | { type: "tool_call"; name: string; input: unknown }
  | { type: "tool_result"; name: string; result: unknown; durationMs: number }
  | { type: "tool_error"; name: string; error: string; isRateLimit: boolean }
  | { type: "reasoning"; text: string }
  | { type: "synthesis"; findings: SynthesiseFinding[] };

async function handleFetchChangelog(
  db: Db,
  input: { package: string; from_version: string; to_version: string },
  onTrace?: (e: TraceEvent) => void,
) {
  const result = await fetchChangelogWithCache(db, input.package, input.from_version, input.to_version);
  if (result.status === "found") {
    onTrace?.({ type: "changelog_discovery", source: result.source, cacheHit: result.cacheHit, contentLength: result.content.length });
    return { status: result.status, source: result.source, versions: result.versions };
  }
  const traceSource = result.status === "partial" ? result.source : result.status;
  onTrace?.({ type: "changelog_discovery", source: traceSource, cacheHit: result.cacheHit, contentLength: 0 });
  return result;
}

async function handleQueryChangelog(
  db: Db,
  input: { package: string; from_version: string; to_version: string; question: string },
  onTrace?: (e: TraceEvent) => void,
) {
  const chunks = await queryChangelog(db, input.question, input.package, input.from_version, input.to_version, 5);
  onTrace?.({ type: "query_result", query: input.question, chunks });
  // Strip distance field before returning to Claude — it's undocumented in the tool schema
  // and would waste tokens. The query_result trace event above already captures it for evals.
  return chunks.map(({ version, content }) => ({ version, content }));
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

async function dispatchTool(
  db: Db,
  toolName: string,
  toolInput: unknown,
  log: Logger,
  onTrace?: (e: TraceEvent) => void,
): Promise<unknown> {
  const start = Date.now();
  try {
    let result: unknown;
    switch (toolName) {
      case "fetch_changelog":
        result = await handleFetchChangelog(db, toolInput as Parameters<typeof handleFetchChangelog>[1], onTrace);
        break;
      case "query_changelog":
        result = await handleQueryChangelog(db, toolInput as Parameters<typeof handleQueryChangelog>[1], onTrace);
        break;
      case "check_npm_metadata":
        result = await handleCheckNpmMetadata(toolInput as { package: string });
        break;
      case "synthesise_risk": {
        const rawInput = toolInput as { findings?: unknown };
        const findings: SynthesiseFinding[] = Array.isArray(rawInput.findings)
          ? rawInput.findings as SynthesiseFinding[]
          : [];
        onTrace?.({ type: "synthesis", findings });
        const risk_levels: Record<string, string> = {};
        for (const f of findings) {
          risk_levels[f.package] = f.risk_level;
        }
        result = { success: true, risk_levels };
        break;
      }
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
    const durationMs = Date.now() - start;
    log.info({ toolName, durationMs }, "tool call succeeded");
    // query_changelog emits a richer query_result event in handleQueryChangelog; skip the
    // generic tool_result to avoid storing duplicate chunk content in the trace.
    if (toolName !== "query_changelog") {
      onTrace?.({ type: "tool_result", name: toolName, result, durationMs });
    }
    return result;
  } catch (err) {
    log.warn({ err, toolName, durationMs: Date.now() - start }, "tool call failed");
    onTrace?.({ type: "tool_error", name: toolName, error: String(err), isRateLimit: /rate limit/i.test(String(err)) });
    throw err;
  }
}

export async function runPackageAgentLoop(
  db: Db,
  pkg: PackageInput,
  log: Logger,
  onEmit?: (event: object) => void,
  onTrace?: (e: TraceEvent) => void,
): Promise<PackageAnalysisResult> {
  const anthropic = new Anthropic();
  let capturedFindings: SynthesiseFinding[] = [];
  const pkgStart = Date.now();

  const systemPrompt =
    `You are an upgrade-risk analyst. For the package "${pkg.packageName}" ` +
    `(upgrading from ${pkg.fromVersion} to ${pkg.toVersion}), use the available ` +
    `tools to assess upgrade risk. This is a ${pkg.isDev ? 'devDependency — lower runtime impact' : 'runtime dependency — affects production behaviour'}.

    Use tools in this order:
    1. fetch_changelog — retrieve changelog content for this version range
    2. query_changelog — investigate breaking changes, removed APIs, migration requirements,
       deprecated APIs, peer-dependency changes, Node.js version requirements, and any
       changes to output generation such as source maps or compiled output format
    3. check_npm_metadata — check package health and maintenance status
    4. synthesise_risk — call this when investigation is complete with your findings and recommendation

    Risk level definitions — apply these strictly:
    - safe: no API changes; patch or security fix only; drop-in replacement
    - low: additive changes only; new optional APIs; no removed or renamed APIs.
      Internal implementation changes that produce compatible output and require no user
      action (e.g. swapping an internal library, improving source map generation) also
      qualify as low — do not inflate these to medium.
    - medium: deprecated APIs warned but not removed; behaviour changes that require
      users to take explicit action or change their configuration to maintain existing behaviour
    - high: APIs removed or renamed; signature changes; migration steps required but documented
    - breaking: complete API overhaul; ESM-only conversion; no backwards compatibility

    Hard rules — these override your judgement:
    - If the package converted to pure ESM and require() no longer works → always breaking
    - If the package has no backwards compatibility and requires a full migration → always breaking

    Only assess changes to the package's own public API. Changes to optional companion
    plugins or related packages in the ecosystem should not raise the risk level of
    the package being assessed.

    Be precise. If no breaking changes are found, say safe or low — do not inflate risk.
    If changelog content is unavailable, say so explicitly and note that your assessment
    is based on incomplete information.`;

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Analyse the upgrade risk for ${pkg.packageName} from version ${pkg.fromVersion} to ${pkg.toVersion}.`,
    },
  ];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let iteration = 0;
  let changelogHasData = false;

  while (true) {
    iteration++;
    const apiStart = Date.now();
    let response: Anthropic.Message;
    try {
      response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: systemPrompt,
        tools: AGENT_TOOLS,
        messages,
      });
    } catch (err) {
      // Break rather than throw so tokens accumulated in prior iterations are preserved
      // in the return value and credited to the caller's cost tracking.
      log.error({ err, iteration }, "claude api call failed");
      onEmit?.({ type: "tool_error", payload: { tool_name: "agent_loop", error: String(err) } });
      break;
    }
    log.info({
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
      let synthesiseCalled = false;

      for (const block of response.content) {
        if (block.type === "text") {
          onTrace?.({ type: "reasoning", text: block.text });
          continue;
        }
        if (block.type !== "tool_use") continue;

        onTrace?.({ type: "tool_call", name: block.name, input: block.input });

        // Skip embedding + DB query when fetch_changelog returned no data — avoids
        // paying for a VoyageAI call that will always return an empty result set.
        if (block.name === "query_changelog" && !changelogHasData) {
          const q = (block.input as { question: string }).question;
          onTrace?.({ type: "query_result", query: q, chunks: [] });
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "[]" });
          continue;
        }

        let result: unknown;
        let isError = false;

        try {
          result = await dispatchTool(
            db,
            block.name,
            block.input,
            log,
            onTrace,
          );
          if (block.name === "fetch_changelog") {
            changelogHasData = (result as Record<string, unknown>)?.status === "found";
          }
          if (block.name === "synthesise_risk") {
            synthesiseCalled = true;
            const raw = (block.input as { findings?: unknown }).findings;
            capturedFindings = Array.isArray(raw) ? (raw as SynthesiseFinding[]) : [];
          }
        } catch (err) {
          isError = true;
          result = { error: String(err) };
          onEmit?.({ type: "tool_error", payload: { tool_name: block.name, error: String(err) } });
        }

        if (!isError) {
          onEmit?.({ type: "tool_call", payload: { tool_name: block.name, input: block.input, result } });
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
          ...(isError ? { is_error: true } : {}),
        });
      }

      messages.push({ role: "user", content: toolResults });

      // Once synthesise_risk has fired we have all findings — no need for an
      // additional Claude turn. Breaking here also prevents findings from being
      // lost if the final end_turn API call were to throw.
      if (synthesiseCalled) break;
    } else {
      for (const block of response.content) {
        if (block.type === "text") onTrace?.({ type: "reasoning", text: block.text });
      }
      if (response.stop_reason === "max_tokens") {
        log.warn({ outputTokens: response.usage.output_tokens, iteration }, "max_tokens reached, stopping loop");
        onEmit?.({
          type: "tool_error",
          payload: { tool_name: "agent_loop", error: "max_tokens reached before synthesise_risk was called" },
        });
      }
      break;
    }
  }

  const safeFindings = Array.isArray(capturedFindings) ? capturedFindings : [];
  const finding = safeFindings.find((f) => f.package === pkg.packageName) ?? safeFindings[0];

  return {
    riskLevel: finding?.risk_level ?? "unknown",
    reasoning: finding?.reasoning ?? null,
    breakingChanges: finding?.breaking_changes ?? null,
    findings: safeFindings,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    durationMs: Date.now() - pkgStart,
  };
}
