import { describe, it, expect, vi } from "vitest";
import multipart from "@fastify/multipart";
import { buildApp, mockDb } from "./src/test-utils";
import packagesPlugin from "./src/packages/index";

function build() {
  const app = buildApp(mockDb(null));
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

describe("Test Error", () => {
  it("shows error", async () => {
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
    console.log("Status:", res.statusCode);
    console.log("Response:", res.json());
  });
});
