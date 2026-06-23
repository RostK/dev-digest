# Skill routing — which skills review which files

The skill classifies every changed file by path into one or more **buckets**, then runs that
bucket's skills against only those files. A file may match several buckets — review it under
each (e.g. a `routes.ts` that builds a Drizzle query is both Backend HTTP and a layering
concern; a contract under `vendor/shared` is both Contracts and onion).

## Buckets

### UI — `client/**/*.{ts,tsx}`
- **frontend-ui-architecture** — file placement, feature boundaries, Server/Client split,
  business logic out of components, junk-drawer `utils`, cross-feature imports, secrets in a
  `"use client"` graph.
- **react-best-practices** — hooks rules, state, rendering, memoization, effects, data fetching.
- **next-best-practices** — App Router mechanics, RSC boundaries, `async` APIs, metadata,
  route handlers, image/font/bundling.
- **typescript-expert** — type safety at the seams, `any`/unsafe casts, public types.

### UI tests — `client/**/*.test.{ts,tsx}`, `e2e/**`
- **react-testing-library** — query priority, `userEvent`, async patterns, no-implementation
  testing, mocking. *(Plus the UI skills for the code under test.)*
- `e2e/**` is the deterministic, no-LLM browser suite (`@devdigest/e2e`).

### Backend HTTP — `server/src/modules/**/routes.ts`, `server/src/platform/**`
- **fastify-best-practices** — schema-first validation, plugins, hooks, error handling,
  serialization, CORS/security headers, logging.
- **onion-architecture** — routes stay thin HTTP glue: no Drizzle, no adapter `new`, no
  sibling-module imports; resolve `getContext()`; map rows → a contract DTO before returning.

### Backend app / data — `server/src/modules/**/{service,repository}*.ts`, `**/repository/**`
- **onion-architecture** — services depend on the `Container` + their repository, not concrete
  adapters or `process.env`; **all** Drizzle stays in the repository; every query scoped by
  `workspace_id`; no cross-module reach.
- **drizzle-orm-patterns** — query/relations/transaction correctness, schema usage.

### DB — `server/src/db/schema*/**`, `server/src/db/migrations/**`
- **postgresql-table-design** — data types, indexing, constraints, normalization.
- **drizzle-orm-patterns** — schema definition + migration mechanics.
- ⚠ `server/src/db/migrations/**` is **generated** — flag any hand-edit (regenerate via
  `pnpm db:generate`). Destructive migrations (drop column/table, type narrowing) are critical.

### Contracts — `server/src/vendor/shared/**`, `**/contracts/**`, any `z.object(...)`
- **zod** — schema correctness, `safeParse` at boundaries, discriminated unions, no double
  validation, error shape.
- **onion-architecture** — `@devdigest/shared` Zod contracts are the single source of truth
  (request validation + response serialization + LLM output). The two vendor copies (server &
  client) must stay in sync — never fork one. See the `shared-contracts-dual-vendor` memory.

### Pure engine — `reviewer-core/**`
- **onion-architecture** — the engine is framework-free: **no** `fastify`, no DB, no `fs`, no
  `server/` imports. Its only side effect is the injected `LLMProvider`. Any outer-ring import
  here is critical.
- **typescript-expert** — keep the engine's public types tight.

### Cross-cutting — any file touching auth / secrets / user input / uploads / an endpoint
- **security** (OWASP Top 10:2025) — authz/IDOR, injection, secret handling, upload safety,
  input validation. Secrets live in `~/.devdigest/secrets.json` (mode 0600) and flow through
  `container.secrets` — never `process.env` for a key, never logged, never in a client bundle.

## Files to skip (not reviewed)

- `**/*.md`, docs, `*.json` fixtures, lockfiles, generated `dist/` — unless the change is the
  point of the PR.
- `mermaid-diagram` and `engineering-insights` are **not** review rubrics and never run here.

## When a file matches nothing

Review it under **typescript-expert** (if `.ts`/`.tsx`) and **security** (if it handles input,
auth, or secrets). If still nothing applies, note it as "unrouted — manual eyeball" rather than
silently dropping it.
