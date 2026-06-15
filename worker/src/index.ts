import "./env";
import { analysisWorker } from "./consumers/analysis";
import { rootLogger } from "./logger";

rootLogger.info({ nodeVersion: process.version, env: process.env.NODE_ENV ?? "development" }, "worker starting");

async function shutdown() {
  rootLogger.info("shutting down");
  await analysisWorker.close();
  rootLogger.info("shutdown complete");
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

rootLogger.info("worker ready");
