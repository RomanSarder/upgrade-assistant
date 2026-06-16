import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import { cosineDistance } from "drizzle-orm/sql/functions";
import { changelogChunks } from "../src/db/schema/changelog-chunks";
import { embed, chunkAndEmbed } from "../src/changelog/embeddings";
import { cleanChangelog } from "../src/changelog/clean-changelog";
import { findCached, insertChunks } from "../src/changelog/repository";
import { fetchChangelog } from "../src/changelog/fetch";

const DIVIDER = "━".repeat(40);
const TOP_K = 5;
const VERDICT_TOP_N = 3;
const FULL_CONTENT = process.argv.includes("--full");
// 3 RPM limit: wait 65s before retrying after a 429
const RETRY_DELAY_MS = 65_000;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Retry wrapper for VoyageAI 429s — embed() makes multiple batch calls with no
// inter-batch delay, so large changelogs can exceed 3 RPM mid-call.
async function withRetry<T>(label: string, fn: () => Promise<T>, maxAttempts = 5): Promise<T> {
  let delay = RETRY_DELAY_MS;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      if (attempt === maxAttempts || err?.statusCode !== 429) throw err;
      console.log(`  (429 on ${label}, attempt ${attempt}/${maxAttempts - 1} — retrying in ${delay / 1000}s...)`);
      await sleep(delay);
      delay = Math.min(Math.round(delay * 1.5), 180_000);
    }
  }
  throw new Error("unreachable");
}

const TEST_CASES = [
  // {
  //   package: "chalk",
  //   from: "4.0.0",
  //   to: "5.0.0",
  //   keywords: ["ESM", "require", "CommonJS"],
  // },
  // {
  //   package: "uuid",
  //   from: "7.0.0",
  //   to: "8.0.0",
  //   keywords: ["named", "export", "default"],
  // },
  // {
  //   package: "axios",
  //   from: "0.27.2",
  //   to: "1.0.0",
  //   keywords: ["CancelToken", "interceptor"],
  // },
  // {
  //   package: "express",
  //   from: "4.0.0",
  //   to: "5.0.0",
  //   keywords: ["path-to-regexp", "deprecated", "Node"],
  // },
  // {
  //   package: "eslint",
  //   from: "7.0.0",
  //   to: "8.0.0",
  //   keywords: ["flat", "config", "plugin"],
  // },
  {
    package: "@babel/core",
    from: "7.0.0",
    to: "7.20.0",
    // keywords: ["source map", "top-level await", "preset", "plugin"],
    keywords: ["source map", "top-level await"],
  }
];

async function runTest(
  db: ReturnType<typeof drizzle>,
  tc: (typeof TEST_CASES)[number],
): Promise<boolean> {
  const queryText = `were there any changes to source map generation in ${tc.package} between version ${tc.from} and ${tc.to}?`
  // const queryText = `what breaking changes exist in ${tc.package} between version ${tc.from} and ${tc.to}?`;

  console.log(`\n${DIVIDER}`);
  console.log(`PACKAGE: ${tc.package}  (${tc.from} → ${tc.to})`);
  console.log(`QUERY:   "${queryText}"`);
  console.log(DIVIDER);

  const [queryEmbedding] = await withRetry(`${tc.package} query embed`, () => embed([queryText]));

  const similarity = sql<number>`1 - (${cosineDistance(changelogChunks.changelogEmbedding, queryEmbedding)})`;

  const rows = await db
    .select({
      version: changelogChunks.version,
      content: changelogChunks.content,
      source: changelogChunks.source,
      score: similarity,
    })
    .from(changelogChunks)
    .where(
      and(
        eq(changelogChunks.packageName, tc.package),
        eq(changelogChunks.fromVersion, tc.from),
        eq(changelogChunks.toVersion, tc.to),
        gt(changelogChunks.fetchedAt, sql`NOW() - INTERVAL '7 days'`),
      ),
    )
    .orderBy(asc(cosineDistance(changelogChunks.changelogEmbedding, queryEmbedding)))
    .limit(TOP_K);

  if (rows.length === 0) {
    console.log("\n  (no chunks found for this package/version range)\n");
    console.log(`VERDICT: ❌`);
    console.log(`Expected keywords: ${JSON.stringify(tc.keywords)}`);
    return false;
  }

  rows.forEach((row, i) => {
    const score = typeof row.score === "number" ? row.score.toFixed(4) : String(row.score);
    console.log(`\n[${i + 1}] score: ${score}  version: ${row.version}  source: ${row.source}`);
    if (FULL_CONTENT) {
      console.log(row.content);
    } else {
      const preview = row.content.slice(0, 300).replace(/\n/g, " ");
      console.log(`    "${preview}${row.content.length > 300 ? "…" : ""}"`);
    }
  });

  const topChunks = rows.slice(0, VERDICT_TOP_N);
  const combinedText = topChunks.map((r) => r.content).join(" ");
  const hitKeywords = tc.keywords.filter((kw) =>
    combinedText.toLowerCase().includes(kw.toLowerCase()),
  );
  const passed = hitKeywords.length > 0;

  console.log(`\nVERDICT: ${passed ? "✅" : "❌"}${passed ? `  (top-${VERDICT_TOP_N} chunks contain: ${hitKeywords.join(", ")})` : `  (none of the top-${VERDICT_TOP_N} chunks matched expected keywords)`}`);
  console.log(`Expected keywords: ${JSON.stringify(tc.keywords)}`);

  return passed;
}

async function main() {
  const pgClient = postgres(process.env.DATABASE_URL!);
  const db = drizzle(pgClient);

  try {
    // Ingest phase — check cache first; only fetch+embed if missing
    console.log("── INGEST PHASE ──");
    for (const tc of TEST_CASES) {
      const cached = await findCached(db, tc.package, tc.from, tc.to);
      if (cached) {
        console.log(`${tc.package}: cache hit (${cached.source})`);
        continue;
      }

      console.log(`${tc.package}: fetching changelog...`);
      const result = await fetchChangelog(tc.package, tc.from, tc.to);

      if (result.status === "found") {
        console.log(`  embedding ${result.slices.length} version slices (may retry on 429)...`);
        const cleanedSlices = result.slices.map(s => ({ ...s, content: cleanChangelog(s.content) }));
        const chunks = await withRetry(
          `${tc.package} ingest embed`,
          () => chunkAndEmbed(cleanedSlices),
        );
        await insertChunks(db, tc.package, tc.from, tc.to, chunks, result.source);
        console.log(`  stored ${chunks.length} chunks (source: ${result.source})`);
      } else {
        console.log(`  no changelog found`);
      }
    }

    console.log();

    // Query phase
    const results: { package: string; passed: boolean }[] = [];
    for (const tc of TEST_CASES) {
      const passed = await runTest(db, tc);
      results.push({ package: tc.package, passed });
    }

    console.log(`\n${DIVIDER}`);
    console.log("SUMMARY");
    console.log(results.map((r) => `${r.package} ${r.passed ? "✅" : "❌"}`).join("   "));
    console.log();
  } finally {
    await pgClient.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
