import type { AnalysisRow, Budget, StreamLogEntry } from "./types";

export const DEMO_LOG_ENTRIES: StreamLogEntry[] = [
  { id: 0,  kind: "package_start",     text: "react  17.0.2 → 18.2.0" },
  { id: 1,  kind: "changelog_found",   text: "changelog · github-raw · 24 versions" },
  { id: 2,  kind: "npm_metadata",      text: "18.4M weekly downloads · last published Jan 2024" },
  { id: 3,  kind: "query",             text: "Are there breaking API changes when upgrading to React 18?" },
  { id: 4,  kind: "query",             text: "Is ReactDOM.render still supported in React 18?" },
  { id: 5,  kind: "risk",              text: "ReactDOM.render is deprecated (not removed) — switch to createRoot for Concurrent Mode. Automatic batching now applies in all contexts. New useId, useTransition, useDeferredValue hooks.", riskLevel: "medium" },
  { id: 6,  kind: "package_start",     text: "express  4.18.0 → 5.0.0" },
  { id: 7,  kind: "changelog_found",   text: "changelog · npm · 8 versions" },
  { id: 8,  kind: "npm_metadata",      text: "32.1M weekly downloads · last published Mar 2024" },
  { id: 9,  kind: "query",             text: "What breaking changes exist in Express 5?" },
  { id: 10, kind: "query",             text: "Have error handler signatures changed?" },
  { id: 11, kind: "risk",              text: "Router path parameter wildcard (*) no longer matches. res.json() no longer accepts non-object values. app.router removed. Error handlers must have exactly 4 parameters.", riskLevel: "high" },
  { id: 12, kind: "package_start",     text: "lodash  4.17.19 → 4.17.21" },
  { id: 13, kind: "changelog_missing", text: "no changelog available" },
  { id: 14, kind: "npm_metadata",      text: "45.2M weekly downloads · last published Jun 2023" },
  { id: 15, kind: "query",             text: "Any breaking changes in lodash 4.17.21?" },
  { id: 16, kind: "risk",              text: "Patch release — security fixes only, no API changes.", riskLevel: "safe" },
  { id: 17, kind: "package_start",     text: "webpack  4.46.0 → 5.90.0" },
  { id: 18, kind: "changelog_found",   text: "changelog · github-raw · 156 versions" },
  { id: 19, kind: "npm_metadata",      text: "22.3M weekly downloads · last published Feb 2024" },
  { id: 20, kind: "query",             text: "What are the breaking changes in webpack 5?" },
  { id: 21, kind: "query",             text: "Are Node.js polyfills still included by default?" },
  { id: 22, kind: "risk",              text: "Node.js polyfills (crypto, path, fs, buffer…) removed — add explicit polyfill packages. __dirname and __filename unavailable in ESM. JSON modules require assert { type: 'json' }. Module federation API changed. optimization.splitChunks format changed.", riskLevel: "breaking" },
  { id: 23, kind: "package_start",     text: "typescript  4.9.5 → 5.4.5" },
  { id: 24, kind: "tool_error",        text: "fetch_changelog: request timeout after 5000ms" },
  { id: 25, kind: "npm_metadata",      text: "51.8M weekly downloads · last published Apr 2024" },
  { id: 26, kind: "query",             text: "Any breaking changes in TypeScript 5 for existing code?" },
  { id: 27, kind: "risk",              text: "Resolution mode defaults changed. Some deprecated compiler options removed. Decorators semantics updated (use experimentalDecorators for legacy). Generally backward-compatible for most projects.", riskLevel: "low" },
];

export const DEMO_ROWS: AnalysisRow[] = [
  {
    package: "webpack",
    from_version: "4.46.0",
    to_version: "5.90.0",
    risk_level: "breaking",
    breaking_changes:
      "- Node.js built-in polyfills (crypto, path, fs, buffer, etc.) are **no longer included** — install explicit polyfill packages and configure `resolve.fallback`.\n- `__dirname` and `__filename` are not available in ESM modules.\n- JSON modules require `assert { type: 'json' }` import assertion.\n- Module Federation API changed — update plugin configuration.\n- `optimization.splitChunks.cacheGroups` default names changed.\n- `output.jsonpFunction` renamed to `output.chunkLoadingGlobal`.",
  },
  {
    package: "express",
    from_version: "4.18.0",
    to_version: "5.0.0",
    risk_level: "high",
    breaking_changes:
      "- Router path parameter wildcard `*` is no longer supported — use named params or regex.\n- `res.json()` no longer accepts non-object values (numbers, strings).\n- `app.router` has been removed.\n- Error handlers must have **exactly 4 parameters** `(err, req, res, next)`.\n- `req.param()` removed — use `req.params`, `req.query`, or `req.body` directly.",
  },
  {
    package: "react",
    from_version: "17.0.2",
    to_version: "18.2.0",
    risk_level: "medium",
    breaking_changes:
      "- `ReactDOM.render` is deprecated — switch to `createRoot` from `react-dom/client`.\n- Automatic batching now applies to all state updates (previously only in React event handlers).\n- Strict Mode now mounts components twice in development.\n- New hooks: `useId`, `useTransition`, `useDeferredValue`, `useInsertionEffect`.",
  },
  {
    package: "typescript",
    from_version: "4.9.5",
    to_version: "5.4.5",
    risk_level: "low",
    breaking_changes:
      "- Module resolution defaults changed (use `moduleResolution: bundler` for bundler environments).\n- `--target ES3` and `--target ES5` with decorators now requires `--experimentalDecorators`.\n- Some rarely-used compiler options removed.",
  },
  {
    package: "lodash",
    from_version: "4.17.19",
    to_version: "4.17.21",
    risk_level: "safe",
  },
];

export const DEMO_SUMMARY: Record<string, number> = { breaking: 1, high: 1, medium: 1, low: 1, safe: 1 };

export const DEMO_COST = { tokens_used: 48320, cost_usd: 0.0876 };

export const DEMO_BUDGET: Budget = { limit: 2.00, used: 0.87 };
