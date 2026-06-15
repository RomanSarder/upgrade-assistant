import Fastify, { FastifyInstance } from "fastify";
import sensible from "@fastify/sensible";
import cookie from "@fastify/cookie";

const DB_METHODS = [
  "select", "insert", "update", "delete",
  "from", "where", "values", "set", "orderBy",
  "returning", "onConflictDoNothing",
  "innerJoin", "leftJoin",
  "groupBy", "limit", "offset",
];

export function mockDb(result: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of DB_METHODS) {
    chain[m] = () => chain;
  }
  (chain as any).then = (res: any, rej?: any) =>
    Promise.resolve(result).then(res, rej);
  (chain as any).catch = (rej: any) => Promise.resolve(result).catch(rej);
  return chain as any;
}

export function mockDbMulti(...results: unknown[]) {
  let i = 0;
  const chain: any = {};
  for (const m of DB_METHODS) {
    chain[m] = () => chain;
  }
  chain.then = (res: any, rej?: any) => {
    const result = results[i++] ?? [];
    if (result instanceof Error) {
      return Promise.reject(result).then(res, rej);
    }
    return Promise.resolve(result).then(res, rej);
  };
  return chain;
}

export function buildApp(db: any): FastifyInstance {
  const app = Fastify();
  app.register(sensible);
  app.register(cookie);
  app.decorate("db", db);
  app.decorate("config", {
    REDIS_URL: "redis://localhost:6379",
    DATABASE_URL: "postgres://localhost/test",
    NODE_ENV: "test" as const,
    ANTHROPIC_API_KEY: "test-key",
    VOYAGE_API_KEY: "test-key",
  });
  return app;
}
