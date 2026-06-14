import fp from "fastify-plugin";
import { FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { sessions } from "../db/schema";
import { hashSecret } from "./utils";
import { addToDate } from "../utils";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(async (fastify) => {
  fastify.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    const cookie = request.cookies["upgrade_advisor_token"];

    if (!cookie) {
      return reply.unauthorized();
    }

    const [id, secret] = cookie.split(".");

    const [session] = await fastify.db.select().from(sessions).where(eq(sessions.id, id));

    if (!session) {
      return reply.unauthorized();
    }

    const secretHashHex = Buffer.from(await hashSecret(secret)).toString("hex");

    if (secretHashHex !== session.secretHash) {
      return reply.unauthorized();
    }

    if (session.expiresAt < new Date()) {
      return reply.unauthorized();
    }

    await fastify.db
      .update(sessions)
      .set({ expiresAt: addToDate(new Date(), { days: 7 }) })
      .where(eq(sessions.id, id));
  });
});
