import { describe, it, expect, vi, afterEach } from "vitest";
import multipart from "@fastify/multipart";
import { buildApp, mockDb } from "../test-utils";
import packagesPlugin from "./index";

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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /packages/analyse", () => {
  it("returns 400 when no file field is in the multipart body", async () => {
    const app = build();
    const boundary = "test-boundary";
    const body = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="other"\r\n` +
      `\r\n` +
      `value\r\n` +
      `--${boundary}--\r\n`
    );
    const res = await app.inject({
      method: "POST",
      url: "/packages/analyse",
      payload: body,
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for wrong MIME type", async () => {
    const app = build();
    const { body, headers } = makeFormFile("{}", "text/plain");
    const res = await app.inject({
      method: "POST",
      url: "/packages/analyse",
      payload: body,
      headers,
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for malformed JSON", async () => {
    const app = build();
    const { body, headers } = makeFormFile("not valid json");
    const res = await app.inject({
      method: "POST",
      url: "/packages/analyse",
      payload: body,
      headers,
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when top-level value is not an object", async () => {
    const app = build();
    const { body, headers } = makeFormFile("[1, 2, 3]");
    const res = await app.inject({
      method: "POST",
      url: "/packages/analyse",
      payload: body,
      headers,
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 202 with a jobId when package.json has no deps", async () => {
    const app = build();
    const { body, headers } = makeFormFile(JSON.stringify({ name: "my-app", version: "1.0.0" }));
    const res = await app.inject({
      method: "POST",
      url: "/packages/analyse",
      payload: body,
      headers,
    });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ jobId: expect.any(String) });
  });

  it("returns 202 with a jobId for prod dependencies", async () => {
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

  it("returns 202 with a jobId for dev dependencies", async () => {
    const app = build();
    const pkg = { devDependencies: { vitest: "^4.1.8" } };
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

  it("returns 202 with a jobId for mixed prod and dev deps", async () => {
    const app = build();
    const pkg = {
      dependencies: { fastify: "5.0.0" },
      devDependencies: { vitest: "4.1.8" },
    };
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

  it("returns 202 with a jobId regardless of versions present", async () => {
    const app = build();
    const pkg = { dependencies: { "unknown-pkg": "1.0.0" } };
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
