import { describe, it, expect, vi } from "vitest";
import multipart from "@fastify/multipart";
import { buildApp, mockDb } from "./src/test-utils";
import packagesPlugin from "./src/packages/index";

vi.mock("bullmq", () => ({
  Queue: class {
    add = vi.fn().mockResolvedValue(undefined);
    close = vi.fn().mockResolvedValue(undefined);
  },
}));

function build() {
  const app = buildApp(mockDb([]));
  app.register(multipart);
  app.register(packagesPlugin);
  return app;
}

function makeFormFile(content: string, mimeType = "application/json") {
  const boundary = "test-boundary";
  const body = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="package.json"\r\n` +
    `Content-Type: ${mimeType}\r\n` +
    `\r\n` +
    `${content}\r\n` +
    `--${boundary}--\r\n`
  );
  return { body, headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

describe("POST /packages/analyse (smoke)", () => {
  it("returns 202 with jobId for a valid package.json", async () => {
    const app = build();
    const pkg = { dependencies: { fastify: "^5.0.0" } };
    const { body, headers } = makeFormFile(JSON.stringify(pkg));
    const res = await app.inject({
      method: "POST",
      url: "/packages/analyse",
      payload: body,
      headers,
    });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ jobId: expect.any(String) });
  });
});
