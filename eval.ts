import { config as loadEnv } from "dotenv";
loadEnv({ path: "worker/.env" });
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import pino from "pino";
import fs from "fs";
import path from "path";
import { and, count, eq } from "drizzle-orm";
import * as schema from "./backend/src/db/schema";
import { changelogChunks } from "./backend/src/db/schema/changelog-chunks";
import {
  runPackageAgentLoop,
  type TraceEvent,
  INPUT_COST_PER_MILLION_TOKENS,
  OUTPUT_COST_PER_MILLION_TOKENS,
} from "./worker/src/agent/run-package";

const DIVIDER = "━".repeat(40);
const EVAL_RESULTS_DIR = path.join(process.cwd(), "eval-results");

const evalDataset = [
  // {
  //   package: "react",
  //   from: "16.0.0",
  //   to: "17.0.0",
  //   expectedRisk: "high",
  //   requiredFindings: ["event delegation", "document", "root", "event pooling"],
  // },
  // {
  //   package: "react",
  //   from: "17.0.0",
  //   to: "18.0.0",
  //   expectedRisk: "breaking",
  //   requiredFindings: ["batching", "createRoot", "hydrateRoot"],
  // },
  // {
  //   package: "vue",
  //   from: "2.0.0",
  //   to: "3.0.0",
  //   expectedRisk: "breaking",
  //   requiredFindings: ["Composition API", "createApp"],
  // },
  // {
  //   package: "next",
  //   from: "12.0.0",
  //   to: "13.0.0",
  //   expectedRisk: "high",
  //   requiredFindings: ["app directory", "layout"],
  // },
  // {
  //   package: "next",
  //   from: "13.0.0",
  //   to: "14.0.0",
  //   expectedRisk: "high",
  //   requiredFindings: ["Server Actions", "Node.js", "18.17"],
  // },
  // {
  //   package: "webpack",
  //   from: "4.0.0",
  //   to: "5.0.0",
  //   expectedRisk: "breaking",
  //   requiredFindings: ["polyfill", "Node", "asset modules"],
  // },
  // {
  //   package: "axios",
  //   from: "0.27.2",
  //   to: "1.0.0",
  //   expectedRisk: "high",
  //   requiredFindings: ["CancelToken", "interceptor"],
  // },
  // {
  //   package: "jest",
  //   from: "26.0.0",
  //   to: "27.0.0",
  //   expectedRisk: "high",
  //   requiredFindings: ["fake timers", "jsdom", "node", "jest-circus"],
  // },
  // {
  //   package: "jest",
  //   from: "27.0.0",
  //   to: "28.0.0",
  //   expectedRisk: "high",
  //   requiredFindings: ["ESM", "jest-environment-jsdom"],
  // },
  // {
  //   package: "eslint",
  //   from: "7.0.0",
  //   to: "8.0.0",
  //   expectedRisk: "high",
  //   requiredFindings: ["plugin", "config", "Node.js"],
  // },
  // {
  //   package: "typescript",
  //   from: "4.0.0",
  //   to: "5.0.0",
  //   expectedRisk: "high",
  //   requiredFindings: ["decorator", "moduleResolution", "bundler"],
  // },
  // {
  //   package: "express",
  //   from: "4.0.0",
  //   to: "5.0.0",
  //   expectedRisk: "high",
  //   requiredFindings: ["path-to-regexp", "rejected", "wildcard"],
  // },
  // {
  //   package: "lodash",
  //   from: "4.17.20",
  //   to: "4.17.21",
  //   expectedRisk: "safe",
  //   requiredFindings: [],
  // },
  // {
  //   package: "moment",
  //   from: "2.29.0",
  //   to: "2.29.4",
  //   expectedRisk: "safe",
  //   requiredFindings: [],
  // },
  {
    package: "chalk",
    from: "4.0.0",
    to: "5.0.0",
    expectedRisk: "breaking",
    requiredFindings: ["ESM", "require", "CommonJS"],
  },
  // {
  //   package: "node-fetch",
  //   from: "2.0.0",
  //   to: "3.0.0",
  //   expectedRisk: "breaking",
  //   requiredFindings: ["ESM", "require"],
  // },
  // {
  //   package: "uuid",
  //   from: "7.0.0",
  //   to: "8.0.0",
  //   expectedRisk: "high",
  //   requiredFindings: ["named", "export", "default"],
  // },
  // {
  //   package: "@babel/core",
  //   from: "7.0.0",
  //   to: "7.20.0",
  //   expectedRisk: "medium",
  //   requiredFindings: ["source map", "top-level await"],
  // },
  // {
  //   package: "prisma",
  //   from: "4.0.0",
  //   to: "5.0.0",
  //   expectedRisk: "high",
  //   requiredFindings: ["client", "schema", "rejectOnNotFound"],
  // },
  // {
  //   package: "tailwindcss",
  //   from: "2.0.0",
  //   to: "3.0.0",
  //   expectedRisk: "high",
  //   requiredFindings: ["JIT", "content", "purge", "PostCSS"],
  // },
] as const;

interface EvalResult {
  index: number;
  pkg: string;
  fromVersion: string;
  toVersion: string;
  expectedRisk: string;
  actualRisk: string;
  verdictMatch: boolean;
  findingsMatched: number;
  findingsTotal: number;
  isFalsePositive: boolean;
  costUsd: number;
  durationMs: number;
}

// The synthesise_risk tool schema only enumerates ["high","medium","low","unknown"].
// The system prompt defines "safe" and "breaking" too, but Claude maps them at tool-call
// time (safe→low, breaking→high). Normalise both sides before comparing.
function normalise(r: string): string {
  const s = r.toLowerCase().trim();
  if (s === "safe") return "low";
  if (s === "breaking") return "high";
  return s;
}

function pct(num: number, den: number): string {
  if (den === 0) return "n/a";
  return `${Math.round((num / den) * 100)}%`;
}

function printResult(r: EvalResult): void {
  const label = `${r.pkg} ${r.fromVersion}→${r.toVersion}`.padEnd(28);
  const exp = `expected: ${r.expectedRisk.padEnd(8)}`;
  const act = `actual: ${r.actualRisk.padEnd(8)}`;
  const icon = r.verdictMatch ? "✅" : "❌";
  const findings = `findings: ${r.findingsMatched}/${r.findingsTotal}`;
  const fp = r.isFalsePositive ? "  (FALSE POSITIVE)" : "";
  console.log(
    `[${String(r.index).padStart(2)}] ${label} ${exp} ${act} ${icon}  ${findings}${fp}`,
  );
}

function printSummary(results: EvalResult[]): void {
  const verdictPassed = results.filter((r) => r.verdictMatch).length;
  const kwFound = results.reduce((s, r) => s + r.findingsMatched, 0);
  const kwTotal = results.reduce((s, r) => s + r.findingsTotal, 0);
  const safeCases = results.filter((r) => r.expectedRisk === "safe");
  const fpCount = results.filter((r) => r.isFalsePositive).length;
  const totalCost = results.reduce((s, r) => s + r.costUsd, 0);
  const avgCost = results.length > 0 ? totalCost / results.length : 0;
  const avgMs =
    results.length > 0
      ? results.reduce((s, r) => s + r.durationMs, 0) / results.length
      : 0;

  console.log(`\n${DIVIDER}`);
  console.log("SUMMARY");
  console.log(DIVIDER);
  console.log(
    `Verdict accuracy:     ${verdictPassed}/${results.length}  (${pct(verdictPassed, results.length)})`,
  );
  console.log(
    `Findings recall:      ${kwFound}/${kwTotal}  (${pct(kwFound, kwTotal)})`,
  );
  console.log(
    `False positive rate:  ${fpCount}/${safeCases.length}  (${pct(fpCount, safeCases.length)})  ← safe packages flagged as non-safe`,
  );
  console.log(`Total cost:           $${totalCost.toFixed(4)}`);
  console.log(`Avg cost per package: $${avgCost.toFixed(4)}`);
  console.log(
    `Avg latency:          ${(avgMs / 1000).toFixed(1)}s per package`,
  );
  console.log(DIVIDER);
}

function buildTraceReport(
  entry: (typeof evalDataset)[number],
  traceEvents: TraceEvent[],
  agentResult: {
    riskLevel: string;
    reasoning: string | null;
    breakingChanges: string | null;
  },
  chunkCount: number,
  evalResult: EvalResult,
) {
  type TE<T extends TraceEvent["type"]> = Extract<TraceEvent, { type: T }>;
  const discovery = traceEvents.find(
    (e): e is TE<"changelog_discovery"> => e.type === "changelog_discovery",
  );
  const rateLimitErrors = traceEvents.filter(
    (e): e is TE<"tool_error"> =>
      e.type === "tool_error" && (e as TE<"tool_error">).isRateLimit,
  );
  const queryResults = traceEvents.filter(
    (e): e is TE<"query_result"> => e.type === "query_result",
  );
  const toolCalls = traceEvents.filter(
    (e): e is TE<"tool_call"> => e.type === "tool_call",
  );
  const reasoningBlocks = traceEvents.filter(
    (e): e is TE<"reasoning"> => e.type === "reasoning",
  );
  const synthesis = traceEvents.find(
    (e): e is TE<"synthesis"> => e.type === "synthesis",
  );

  const reasoning = [agentResult.reasoning, agentResult.breakingChanges]
    .filter(Boolean)
    .join(" ");

  return {
    package: entry.package,
    fromVersion: entry.from,
    toVersion: entry.to,
    changelog: {
      pathRan: discovery?.source ?? "unknown",
      cacheHit: discovery?.cacheHit ?? null,
      contentLength: discovery?.contentLength ?? null,
      rateLimitHits: rateLimitErrors.map((e) => ({
        tool: e.name,
        error: e.error,
      })),
    },
    rag: {
      chunkCount,
      queries: queryResults.map((e) => ({
        query: e.query,
        topK: e.chunks.map((c) => ({
          version: c.version,
          distance: c.distance,
          contentPreview: c.content.slice(0, 300),
        })),
      })),
    },
    agentReasoning: {
      toolCallSequence: toolCalls.map((e) => e.name),
      reasoningText: reasoningBlocks
        .map((e) => e.text)
        .join("\n\n")
        .trim(),
      breakingChanges: agentResult.breakingChanges,
      riskJustification: synthesis?.findings[0]?.reasoning ?? null,
    },
    evalComparison: {
      expectedRisk: entry.expectedRisk,
      actualRisk: agentResult.riskLevel,
      verdictMatch: evalResult.verdictMatch,
      findings: entry.requiredFindings.map((kw) => ({
        keyword: kw,
        matched: reasoning.toLowerCase().includes(kw.toLowerCase()),
      })),
      falsePositive: evalResult.isFalsePositive,
      falsePositiveText: evalResult.isFalsePositive ? reasoning : null,
    },
  };
}

async function main(): Promise<void> {
  const pgClient = postgres(process.env.DATABASE_URL!);
  const db = drizzle(pgClient, { schema });
  const log = pino({ level: "warn" });

  fs.mkdirSync(EVAL_RESULTS_DIR, { recursive: true });

  console.log(`\n${DIVIDER}`);
  console.log("EVAL RESULTS");
  console.log(`${DIVIDER}\n`);

  const results: EvalResult[] = [];

  try {
    for (let i = 0; i < evalDataset.length; i++) {
      const entry = evalDataset[i];
      const traceEvents: TraceEvent[] = [];

      let agentResult;
      try {
        agentResult = await runPackageAgentLoop(
          db,
          {
            packageName: entry.package,
            fromVersion: entry.from,
            toVersion: entry.to,
            isDev: false,
          },
          log.child({ pkg: entry.package }),
          undefined,
          (e) => traceEvents.push(e),
        );
      } catch (err) {
        console.error(`  [${i + 1}] ${entry.package}: agent error — ${err}`);
        agentResult = {
          riskLevel: "unknown",
          reasoning: null,
          breakingChanges: null,
          findings: [],
          inputTokens: 0,
          outputTokens: 0,
          durationMs: 0,
        };
      }

      const actualRisk = agentResult.riskLevel;
      const verdictMatch =
        normalise(entry.expectedRisk) === normalise(actualRisk);

      const reasoning = [agentResult.reasoning, agentResult.breakingChanges]
        .filter(Boolean)
        .join(" ");
      const findingsMatched = entry.requiredFindings.filter((kw) =>
        reasoning.toLowerCase().includes(kw.toLowerCase()),
      ).length;

      const isFalsePositive =
        (entry.expectedRisk as string) === "safe" &&
        normalise(actualRisk) !== "low";

      const costUsd =
        (agentResult.inputTokens / 1_000_000) * INPUT_COST_PER_MILLION_TOKENS +
        (agentResult.outputTokens / 1_000_000) * OUTPUT_COST_PER_MILLION_TOKENS;

      const evalResult: EvalResult = {
        index: i + 1,
        pkg: entry.package,
        fromVersion: entry.from,
        toVersion: entry.to,
        expectedRisk: entry.expectedRisk,
        actualRisk,
        verdictMatch,
        findingsMatched,
        findingsTotal: entry.requiredFindings.length,
        isFalsePositive,
        costUsd,
        durationMs: agentResult.durationMs,
      };

      results.push(evalResult);
      printResult(evalResult);

      // Query chunk count stored for this package+version pair
      const chunkRows = await db
        .select({ value: count() })
        .from(changelogChunks)
        .where(
          and(
            eq(changelogChunks.packageName, entry.package),
            eq(changelogChunks.fromVersion, entry.from),
            eq(changelogChunks.toVersion, entry.to),
          ),
        );
      const chunkCount = Number(chunkRows[0]?.value ?? 0);

      // Write per-package trace file
      const report = buildTraceReport(
        entry,
        traceEvents,
        agentResult,
        chunkCount,
        evalResult,
      );
      const safeName = entry.package.replace(/[@/]/g, "-").replace(/^-+/, "");
      const outPath = path.join(
        EVAL_RESULTS_DIR,
        `${safeName}-${entry.from}-${entry.to}.json`,
      );
      fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    }

    printSummary(results);
    console.log(`\nTrace files written to: ${EVAL_RESULTS_DIR}`);
  } finally {
    await pgClient.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
