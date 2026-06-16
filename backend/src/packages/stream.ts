import type { FastifyPluginAsync } from "fastify";

const stream: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { jobId: string } }>(
    "/stream",
    {
      schema: {
        querystring: {
          type: "object",
          required: ["jobId"],
          properties: { jobId: { type: "string" } },
        },
      },
    },
    async (request, reply) => {
      const { jobId } = request.query;

      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const channel = `job:${jobId}`;
      const subscriber = fastify.redis.duplicate();

      let closed = false;

      function cleanup() {
        if (closed) return;
        closed = true;
        subscriber.unsubscribe(channel).catch(() => {});
        subscriber.quit().catch(() => {});
        reply.raw.end();
      }

      request.raw.on("close", cleanup);

      subscriber.on("message", (_channel: string, message: string) => {
        if (closed) return;
        reply.raw.write(`data: ${message}\n\n`);

        let parsed: { type: string } | null = null;
        try {
          parsed = JSON.parse(message) as { type: string };
        } catch {
          // malformed message — keep connection open
        }
        if (parsed?.type === "done" || parsed?.type === "error" || parsed?.type === "budget_exceeded") {
          cleanup();
        }
      });

      try {
        await subscriber.subscribe(channel);
      } catch (err) {
        cleanup();
        throw err;
      }
    },
  );
};

export default stream;
