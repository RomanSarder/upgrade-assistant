import fastifyEnv from "@fastify/env";
import fp from "fastify-plugin";

declare module "fastify" {
  interface FastifyInstance {
    config: {
      DATABASE_URL: string;
      REDIS_URL: string;
      NODE_ENV: "development" | "production" | "test";
      FRONTEND_URL?: string;
    };
  }
}

const schema = {
  type: "object",
  required: ["DATABASE_URL", "REDIS_URL", "NODE_ENV", "GITHUB_TOKEN"],
  properties: {
    DATABASE_URL: {
      type: "string",
    },
    REDIS_URL: {
      type: "string",
    },
    NODE_ENV: {
      type: "string",
      default: "development",
    },
    FRONTEND_URL: {
      type: "string",
    },
    GITHUB_TOKEN: {
      type: 'string',
    }
  },
};

export default fp(async (fastify) => {
  await fastify.register(fastifyEnv, { schema, dotenv: true });
});
