import { Worker, Queue } from "bullmq";
import Redis from "ioredis";
import semver from "semver";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@backend/db/schema";
import { env } from "../env";
import { rootLogger } from "../logger";

interface PackageEntry {
  name: string;
  version: string;
  isDev: boolean;
}

interface PackagesJobData {
  jobId: string;
  entries: PackageEntry[];
  userId: string;
}

const { hostname: host, port: portStr, password } = new URL(env.REDIS_URL);
const redisPort = parseInt(portStr) || 6379;

const FETCH_TIMEOUT_MS = 5000;
const CONCURRENCY_LIMIT = 10;

const analysisQueue = new Queue("analysis", {
  connection: { host, port: redisPort, ...(password && { password: decodeURIComponent(password) }), maxRetriesPerRequest: null },
});

async function fetchLatestVersion(name: string): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { version: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export const packagesWorker = new Worker<PackagesJobData>(
  "packages",
  async (job) => {
    const { jobId, entries, userId } = job.data;
    const repoId = jobId;
    const log = rootLogger.child({ jobId, bullJobId: job.id });
    log.info({ entryCount: entries.length }, "packages job received");

    const publisher = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    const emit = (event: object): Promise<void> => {
      return publisher.publish(`job:${jobId}`, JSON.stringify(event)).then(() => {}).catch(() => {});
    };

    const pgClient = postgres(env.DATABASE_URL);
    const db = drizzle(pgClient, { schema });

    try {
      await emit({ type: "started", payload: { total: entries.length } });

      await mapConcurrent(entries, CONCURRENCY_LIMIT, async (entry) => {
        const latestVersion = await fetchLatestVersion(entry.name);
        const coerced = semver.coerce(entry.version);
        const upgradeAvailable =
          coerced !== null && latestVersion !== null
            ? semver.lt(coerced, latestVersion)
            : false;

        if (latestVersion !== null) {
          await db.insert(schema.packages).values({
            repoId,
            packageName: entry.name,
            fromVersion: entry.version,
            toVersion: latestVersion,
            hasUpgradeAvailable: upgradeAvailable,
            isDev: entry.isDev,
          }).onConflictDoNothing();
        }

        await emit({
          type: "package_result",
          payload: {
            name: entry.name,
            currentVersion: entry.version,
            latestVersion,
            isDev: entry.isDev,
            upgradeAvailable,
          },
        });
      });

      const queued = await analysisQueue.add("analyse", { jobId, repoId, userId }, { jobId: `analysis-${jobId}` });
      if (queued) {
        log.info("analysis job enqueued");
      } else {
        log.warn("analysis job already exists for this jobId, skipping enqueue");
      }
    } finally {
      await publisher.quit().catch(() => {});
      await pgClient.end().catch(() => {});
    }

    log.info("packages job completed");
  },
  {
    connection: {
      host,
      port: redisPort,
      ...(password && { password: decodeURIComponent(password) }),
      maxRetriesPerRequest: null,
    },
    concurrency: 2,
  },
);

const errorPublisher = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

packagesWorker.on("failed", (job, err) => {
  if (!job) return;
  const { jobId } = job.data;
  rootLogger.error({ err, jobId, bullJobId: job.id, attemptsMade: job.attemptsMade }, "packages job failed");

  errorPublisher
    .publish(`job:${jobId}`, JSON.stringify({ type: "error", payload: { message: err.message } }))
    .catch(() => {});
});

rootLogger.info("packages worker registered");
