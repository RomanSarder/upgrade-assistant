# Upgrade Assistant Frontend

## Stack
- React 18 + TypeScript
- React Router for routing
- shadcn/ui for all UI components
- Tailwind CSS for styling
- Vite dev server at http://localhost:5173, proxies /api/* to http://localhost:3000

## File structure

```
src/
  auth/        — reference feature: login, verify, session check
  analysis/    — upload page, stream view, results view
  repos/       — repo list, repo card
  shared/      — api client, cn utility
  main.tsx
  router.ts
```

### Structure rules
- Stay flat inside each feature folder
- Do not create subfolders until a single concern reaches 3+ files
- Reference `src/auth/` for file structure, hook conventions, and loading/error patterns

## Rules

### Code style
- All API types come from `@upgrade-assistant/shared` — never define them locally
- Never repeat Tailwind class combinations — extract into named components
- Use shadcn/ui components wherever they exist — never build custom equivalents
- Named exports only — no default exports
- No comments. No inline comments. No section dividers. No JSX block descriptions. If a block needs a comment to explain what it renders, extract it into a named component instead.

### Data fetching
- Use the `apiClient` from `src/shared/api.ts` for all requests — it handles `credentials: 'include'` and JSON parsing
- Follow the pattern in `src/auth/` for loading, error, and empty state handling
- Always handle three states: loading skeleton, error with retry, empty state

### SSE streams
- Use the native `EventSource` API with `withCredentials: true`
- Append incoming events to local state — never store the EventSource instance in state
- Always close the connection in the `useEffect` cleanup function

## What not to do
- Do not define API response types locally — use `@upgrade-assistant/shared`
- Do not use optimistic updates — invalidate and refetch
- Do not install new packages without asking first
- Do not add comments to code
- Do not build custom drawer, modal, or tooltip components — use `Sheet`, `Dialog`, `Tooltip` from shadcn
- Do not use inline styles

## Design
For all visual decisions — colours, layout, component composition, screen structure — refer to `THEME.md`.
