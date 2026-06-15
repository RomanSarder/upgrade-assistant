import { describe, it, expect, vi, afterEach } from "vitest";
import multipart from "@fastify/multipart";
import { buildApp, mockDb } from "../test-utils";
import packagesPlugin from "./index";

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

function mockNpm(versions: Record<string, string | null>) {
  vi.spyOn(global, "fetch").mockImplementation(async (url) => {
    const name = String(url)
      .replace("https://registry.npmjs.org/", "")
      .replace("/latest", "");
    const version = versions[decodeURIComponent(name)];
    if (version === null || version === undefined) {
      return new Response("", { status: 404 });
    }
    return new Response(JSON.stringify({ version }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /packages/analyse", () => {
  it("returns 400 when no file field is in the multipart body", async () => {
    const app = build();
    const boundary = "test-boundary";
    // Send a multipart request with a text field but no file part
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

  it("returns 200 with empty array when package.json has no deps", async () => {
    mockNpm({});
    const app = build();
    const { body, headers } = makeFormFile(JSON.stringify({ name: "my-app", version: "1.0.0" }));
    const res = await app.inject({
      method: "POST",
      url: "/packages/analyse",
      payload: body,
      headers,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("returns upgradeAvailable: true for an outdated prod dependency", async () => {
    mockNpm({ fastify: "5.2.1" });
    const app = build();
    const pkg = { dependencies: { fastify: "^5.0.0" } };
    const { body, headers } = makeFormFile(JSON.stringify(pkg));
    const res = await app.inject({
      method: "POST",
      url: "/packages/analyse",
      payload: body,
      headers,
    });
    expect(res.statusCode).toBe(200);
    const [result] = res.json();
    expect(result).toMatchObject({
      name: "fastify",
      currentVersion: "^5.0.0",
      latestVersion: "5.2.1",
      isDev: false,
      upgradeAvailable: true,
    });
  });

  it("returns upgradeAvailable: false for an up-to-date dev dependency", async () => {
    mockNpm({ vitest: "4.1.8" });
    const app = build();
    const pkg = { devDependencies: { vitest: "^4.1.8" } };
    const { body, headers } = makeFormFile(JSON.stringify(pkg));
    const res = await app.inject({
      method: "POST",
      url: "/packages/analyse",
      payload: body,
      headers,
    });
    expect(res.statusCode).toBe(200);
    const [result] = res.json();
    expect(result).toMatchObject({
      name: "vitest",
      isDev: true,
      upgradeAvailable: false,
    });
  });

  it("sets isDev correctly for mixed prod and dev deps", async () => {
    mockNpm({ fastify: "5.0.0", vitest: "4.1.8" });
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
    expect(res.statusCode).toBe(200);
    const results = res.json();
    expect(results.find((r: any) => r.name === "fastify").isDev).toBe(false);
    expect(results.find((r: any) => r.name === "vitest").isDev).toBe(true);
  });

  it("returns latestVersion: null and upgradeAvailable: false when npm returns 404", async () => {
    mockNpm({ "unknown-pkg": null });
    const app = build();
    const pkg = { dependencies: { "unknown-pkg": "1.0.0" } };
    const { body, headers } = makeFormFile(JSON.stringify(pkg));
    const res = await app.inject({
      method: "POST",
      url: "/packages/analyse",
      payload: body,
      headers,
    });
    expect(res.statusCode).toBe(200);
    const [result] = res.json();
    expect(result).toMatchObject({
      name: "unknown-pkg",
      latestVersion: null,
      upgradeAvailable: false,
    });
  });
});
