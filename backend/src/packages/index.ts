import { FastifyPluginAsync } from "fastify";
import { Queue } from "bullmq";
import streamPlugin from "./stream";

interface PackageEntry {
  name: string;
  version: string;
  isDev: boolean;
}

const packages: FastifyPluginAsync = async (fastify) => {
  const { hostname: host, port: portStr, password } = new URL(fastify.config.REDIS_URL);
  const redisPort = parseInt(portStr) || 6379;

  const packagesQueue = new Queue("packages", {
    connection: {
      host,
      port: redisPort,
      ...(password && { password: decodeURIComponent(password) }),
      maxRetriesPerRequest: null,
    },
  });

  fastify.addHook("onClose", async () => {
    await packagesQueue.close();
  });

  fastify.register(async (fastify) => {
    fastify.register(streamPlugin);

    fastify.post("/analyse", async (request, reply) => {
      let data;
      try {
        data = await request.file();
      } catch {
        return reply.badRequest("Request must be multipart/form-data");
      }

      if (!data) {
        return reply.badRequest("File was not provided");
      }

      if (data.mimetype !== "application/json") {
        return reply.badRequest("File must be JSON");
      }

      const buffer = await data.toBuffer();
      const text = buffer.toString("utf-8");

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return reply.badRequest("Invalid JSON");
      }

      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return reply.badRequest("Invalid package.json: must be a JSON object");
      }

      const pkg = parsed as Record<string, unknown>;
      const dependencies = pkg.dependencies ?? {};
      const devDependencies = pkg.devDependencies ?? {};

      if (typeof dependencies !== "object" || Array.isArray(dependencies)) {
        return reply.badRequest("Invalid package.json: dependencies must be an object");
      }
      if (typeof devDependencies !== "object" || Array.isArray(devDependencies)) {
        return reply.badRequest("Invalid package.json: devDependencies must be an object");
      }

      const entries: PackageEntry[] = [
        ...Object.entries(dependencies as Record<string, string>).map(([name, version]) => ({
          name,
          version,
          isDev: false,
        })),
        ...Object.entries(devDependencies as Record<string, string>).map(([name, version]) => ({
          name,
          version,
          isDev: true,
        })),
      ];

      const jobId = crypto.randomUUID();
      await packagesQueue.add("analyse", { jobId, entries }, { jobId });

      return reply.code(202).send({ jobId });
    });
  }, { prefix: "/packages" });
};

export default packages;
