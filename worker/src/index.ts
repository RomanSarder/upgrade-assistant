import "./env";
import { analysisWorker } from "./consumers/analysis";
import { packagesWorker } from "./consumers/packages";
import { rootLogger } from "./logger";

rootLogger.info({ nodeVersion: process.version, env: process.env.NODE_ENV ?? "development" }, "worker starting");

async function shutdown() {
  rootLogger.info("shutting down");
  const timer = setTimeout(() => {
    rootLogger.warn("shutdown timed out, forcing exit");
    process.exit(1);
  }, 5000).unref();
  try {
    await Promise.all([analysisWorker.close(), packagesWorker.close()]);
    rootLogger.info("shutdown complete");
  } finally {
    clearTimeout(timer);
  }
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

rootLogger.info("worker ready");
