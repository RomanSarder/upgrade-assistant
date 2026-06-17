const GITHUB_HEADERS: Record<string, string> = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

function getGitHubHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return GITHUB_HEADERS;
  return { ...GITHUB_HEADERS, Authorization: `Bearer ${token}` };
}

export async function githubFetch(url: string): Promise<Response> {
  const headers = getGitHubHeaders();
  let res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });

  if (res.status === 403 || res.status === 429) {
    const retryAfter = res.headers.get("Retry-After");
    // Retry-After can be an HTTP-date string ("Sat, 01 Jan ..."); parseInt returns NaN for those
    const parsed = retryAfter !== null ? parseInt(retryAfter, 10) : NaN;
    const waitMs = isNaN(parsed) ? 60_000 : Math.min(parsed * 1000, 60_000);
    await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
    if (res.status === 403 || res.status === 429) {
      console.warn(`[changelog] GitHub rate limit exhausted for ${url}`);
      throw new Error(`GitHub rate limit: ${res.status}`);
    }
  }

  return res;
}

export async function githubFetchPaginated<T>(url: string): Promise<T[]> {
  const results: T[] = [];
  let nextUrl: string | null = url;

  while (nextUrl) {
    const res = await githubFetch(nextUrl);
    if (!res.ok) break;
    const page = (await res.json()) as T[];
    results.push(...page);

    const linkHeader = res.headers.get("link") ?? "";
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    nextUrl = nextMatch ? nextMatch[1] : null;
  }

  return results;
}
