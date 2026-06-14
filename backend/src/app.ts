import { FastifyPluginAsync } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import sensible from "@fastify/sensible";

import env from "./env";
import db from "./db/db";
import cache from "./cache";
import auth from "./auth";
import packages from "./packages";
import fastifyMultipart from "@fastify/multipart";

const app: FastifyPluginAsync = async (fastify): Promise<void> => {
  await fastify.register(env);
  if (fastify.config.FRONTEND_URL) {
    fastify.register(cors, {
      origin: fastify.config.FRONTEND_URL,
      credentials: true,
    });
  }
  fastify.register(cookie);
  fastify.register(sensible);
  fastify.register(db);
  fastify.register(fastifyMultipart)
  fastify.register(cache);
  fastify.register(auth)
  fastify.register(packages)

  fastify.get("/health", async () => ({ status: "ok" }));
};

export default app;
