import { Worker } from "bullmq";
import Redis from "ioredis";
import { env } from "../env";
import { runAgentLoop } from "../agent/loop";
import { jobLogger, rootLogger } from "../logger";

interface AnalysisJobData {
  jobId: string;
  repoId: string;
  userId: string;
}

// ioredis only parses a Redis URL when the constructor receives a bare string.
// Passing { url: "..." } is silently ignored and falls back to 127.0.0.1:6379.
// We parse the URL explicitly so BullMQ's bundled ioredis gets usable host/port options.
const { hostname: host, port: portStr, password } = new URL(env.REDIS_URL);
const redisPort = parseInt(portStr) || 6379;

export const analysisWorker = new Worker<AnalysisJobData>(
  "analysis",
  async (job) => {
    const { jobId, repoId, userId } = job.data;
    const log = jobLogger(jobId, repoId);
    log.info({ bullJobId: job.id }, "job received");

    const start = Date.now();
    await runAgentLoop(jobId, repoId, userId, log);
    log.info({ durationMs: Date.now() - start }, "job completed");
  },
  {
    connection: {
      host,
      port: redisPort,
      ...(password && { password: decodeURIComponent(password) }),
      maxRetriesPerRequest: null,
    },
    concurrency: 1,
  },
);

analysisWorker.on("failed", (job, err) => {
  if (!job) return;
  const { jobId, repoId } = job.data;
  const log = jobLogger(jobId, repoId);
  log.error({ err, bullJobId: job.id, attemptsMade: job.attemptsMade }, "job failed");

  const publisher = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  publisher
    .publish(`job:${jobId}`, JSON.stringify({ type: "error", payload: { message: err.message } }))
    .catch(() => {})
    .finally(() => publisher.quit().catch(() => {}));
});

rootLogger.info("analysis worker registered");
