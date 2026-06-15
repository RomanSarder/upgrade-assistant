import pino from "pino";

export const rootLogger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "upgrade-advisor-worker" },
  ...(process.env.NODE_ENV !== "production" && {
    transport: { target: "pino-pretty", options: { colorize: true } },
  }),
});

export function jobLogger(jobId: string, repoId: string) {
  return rootLogger.child({ jobId, repoId });
}
