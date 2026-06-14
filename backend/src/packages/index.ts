import { FastifyPluginAsync } from "fastify";
import semver from "semver";
import type { ChangelogInfo, PackageResult } from "@upgrade-advisor/shared";
import { fetchChangelogWithCache } from "../changelog/cached-fetch";

const FETCH_TIMEOUT_MS = 5000;
const CONCURRENCY_LIMIT = 10;

async function fetchLatestVersion(name: string): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = await res.json() as { version: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function toChangelogInfo(raw: Awaited<ReturnType<typeof fetchChangelogWithCache>>): ChangelogInfo {
  if (raw.status === "found") {
    return { status: "found", content: raw.content, source: raw.source, versions: raw.versions, slices: raw.slices };
  }
  if (raw.status === "partial") {
    return { status: "partial", compareUrl: raw.compareUrl };
  }
  return { status: "unknown" };
}

const packages: FastifyPluginAsync = async (fastify) => {
  fastify.register(async fastify => {
    fastify.post("/analyse", async (request, reply) => {
      let data;
      try {
        data = await request.file();
      } catch {
        return reply.badRequest('Request must be multipart/form-data');
      }

      if (!data) {
        return reply.badRequest("File was not provided");
      }

      if (data.mimetype !== 'application/json') {
        return reply.badRequest('File must be JSON');
      }

      const buffer = await data.toBuffer();
      const text = buffer.toString('utf-8');

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return reply.badRequest('Invalid JSON');
      }

      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return reply.badRequest('Invalid package.json: must be a JSON object');
      }

      const pkg = parsed as Record<string, unknown>;
      const dependencies = pkg.dependencies ?? {};
      const devDependencies = pkg.devDependencies ?? {};

      if (typeof dependencies !== 'object' || Array.isArray(dependencies)) {
        return reply.badRequest('Invalid package.json: dependencies must be an object');
      }
      if (typeof devDependencies !== 'object' || Array.isArray(devDependencies)) {
        return reply.badRequest('Invalid package.json: devDependencies must be an object');
      }

      const entries = [
        ...Object.entries(dependencies as Record<string, string>).map(([name, version]) => ({ name, version, isDev: false })),
        ...Object.entries(devDependencies as Record<string, string>).map(([name, version]) => ({ name, version, isDev: true })),
      ];

      const results = await mapConcurrent(
        entries,
        CONCURRENCY_LIMIT,
        async ({ name, version: currentVersion, isDev }): Promise<PackageResult> => {
          const latestVersion = await fetchLatestVersion(name);
          const coerced = semver.coerce(currentVersion);
          const upgradeAvailable =
            coerced !== null && latestVersion !== null
              ? semver.lt(coerced, latestVersion)
              : false;

          let changelog: ChangelogInfo;
          if (upgradeAvailable && coerced !== null && latestVersion !== null) {
            const raw = await fetchChangelogWithCache(fastify.db, name, coerced.version, latestVersion);
            changelog = toChangelogInfo(raw);
          } else {
            changelog = { status: "unknown" };
          }

          return { name, currentVersion, latestVersion, isDev, upgradeAvailable, changelog };
        }
      );

      return results;
    })
  }, { prefix: '/packages' })
}

export default packages
