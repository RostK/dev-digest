---
name: onion-architecture
description: "Onion / ports-and-adapters / layered architecture for the DevDigest backend (the server/ Fastify modules and the reviewer-core engine) — deciding WHICH ring backend code belongs in and WHICH WAY its dependencies may point. Use this skill WHENEVER working server-side: adding or changing a route/service/repository, adding an adapter or port, wiring something into the DI Container, deciding whether a route or service may import Drizzle / an SDK / another module, or reviewing the backend's layering — even when the user does not say 'onion' or 'architecture'. It enforces the inward dependency rule, the ports-in-shared / implementations-in-adapters split, the Container as the single composition root, Drizzle-queries-only-in-the-repository, and the Zod @devdigest/shared contracts as the shared domain + boundary type. Backend structure and boundaries only — not Drizzle query syntax (use drizzle-orm-patterns), Fastify route mechanics (use fastify-best-practices), Postgres schema design (use postgresql-table-design), Zod syntax (use zod), or frontend layout (use frontend-ui-architecture)."
when_to_use: "Trigger phrases: 'where does this backend logic / query go', 'can a route or service import the db / Drizzle', 'add a new server module', 'add an adapter / external integration', 'wire this into the container', 'should the service know about Fastify', 'is this module's layering right', 'review the backend architecture', 'how do I keep the engine pure', 'where do the Zod contracts go'."
version: 1.0.0
---

# Onion Architecture (DevDigest backend)

Decisions about **which ring backend code lives in and which way its dependencies may point** for
the `server/` Fastify modules and the `reviewer-core` engine. The DevDigest backend is *already*
onion-shaped (ports-and-adapters behind a DI Container) — this skill makes that structure explicit
and **enforces it on every new or changed module** so the layering does not erode.

This skill is about **boundaries and placement**, not syntax. For Drizzle queries use
**drizzle-orm-patterns**; for Fastify route mechanics use **fastify-best-practices**; for Postgres
schema design use **postgresql-table-design**; for Zod syntax use **zod**.

## Opinionated defaults

The calls already settled for DevDigest. When tempted to answer "it depends," default to these.

- **Dependencies point inward only.** `routes → service → repository → db`, and `service → Container
  → adapter (via a port)`. The domain core depends on nothing outer; `reviewer-core` is the proof —
  it runs with no Fastify and no DB.
- **Ports in the core, implementations in infrastructure.** Adapter *interfaces* live in
  `server/src/vendor/shared/adapters.ts`; concrete adapters live in `server/src/adapters/*`. To add a
  capability, define the interface first, implement it outside, then wire it in the Container.
- **The Container (`server/src/platform/container.ts`) is the only composition root.** Services
  receive `Container` and pull adapters off it (`await container.llm(id)`, `container.git`,
  `container.secrets.get(...)`). **Never `new` a concrete adapter** in a service or route, and never
  read `process.env` for a key — go through `container.secrets`.
- **Drizzle queries live only in the repository.** All `drizzle-orm` / `db/schema` imports and query
  building stay in `repository.ts` (and the colocated `repository/<aggregate>.repo.ts`), every query
  scoped by `workspace_id`. Routes and services never build a query. (Row *types* from `db/rows.ts`
  may flow up as the persistence model — see persistence-and-contracts.md.)
- **Zod `@devdigest/shared` contracts are the shared domain + boundary type.** One schema drives
  request validation, response serialization, *and* LLM output. Importing a shared contract from any
  ring is correct — **not** a layering violation. Validate at the edges (schema-first routes,
  `safeParse` on LLM output); map persistence rows to a contract DTO before returning over HTTP.
- **A module is a vertical slice** (`routes.ts → service.ts → repository.ts` + `helpers.ts` /
  `constants.ts`), registered once in `server/src/modules/index.ts`. **No sibling-module imports** —
  share cross-cutting data access via a repository on the Container (`container.agentsRepo`).

## Reference files

Load on demand — keep this file in context, open a reference only when the task needs that depth.

- **[references/the-devdigest-onion.md](references/the-devdigest-onion.md)** — the four rings mapped to
  the real folders, a full request trace, and step-by-step recipes for a new module and a new adapter.
- **[references/dependency-rules.md](references/dependency-rules.md)** — the import matrix (what each
  ring may and must not import, and why), the inward rule, ports, and the composition root.
- **[references/persistence-and-contracts.md](references/persistence-and-contracts.md)** — Drizzle in
  the repository, the row-vs-DTO map-at-the-seam rule, Zod contracts as the shared type, secrets
  isolation, and keeping `reviewer-core` pure.

## The DevDigest onion

| Ring (outer → inner) | What | Where |
|---|---|---|
| **Presentation** | Fastify route plugins — thin HTTP glue | `server/src/modules/<name>/routes.ts` (registered in `modules/index.ts`) |
| **Infrastructure** | adapter *implementations* + DI wiring + DB access | `server/src/adapters/*`, `server/src/platform/*` (Container, jobs, sse, errors, config), `server/src/db/*` |
| **Application** | use-cases / orchestration + the data-access facade | `server/src/modules/<name>/service.ts`, `repository.ts` (+ `repository/*.repo.ts`) |
| **Domain core** | Zod contracts + adapter *interfaces* (ports); the pure engine | `server/src/vendor/shared/contracts/*`, `vendor/shared/adapters.ts`; `reviewer-core/src/*` |

The inversion that makes it an onion: **`adapters.ts` (a port) sits in the innermost ring, its
implementation in `server/src/adapters/` in the outer ring.** Inner defines the interface; outer
implements it; the Container injects the concrete at the edge.

## Decision framework — which ring does this go in?

Apply in order; each answers a "where does this belong?" question.

1. **An external call** (network, disk, a process, a third-party SDK)? → define a **port** in
   `vendor/shared/adapters.ts`, implement it in `adapters/<kind>/`, resolve it via the **Container**.
   Never make the call inline.
2. **A SQL / Drizzle query**? → `repository.ts` (or a `repository/<aggregate>.repo.ts`), scoped by
   `workspace_id`. Nowhere else.
3. **Use-case orchestration / business logic**? → `service.ts`, depending on `Container` + the
   repository, not on concrete adapters.
4. **An HTTP shape** (params / body / response)? → a Zod contract in `vendor/shared/contracts/*`, used
   **schema-first** in `routes.ts` (declare it in the route `schema`; do not hand-roll `.parse`).
5. **Pure diff → prompt → LLM → findings logic**? → `reviewer-core`, framework-free (no Fastify, no
   DB, no `fs`); its only side effect is the injected `LLMProvider`.
6. **Wiring** (which concrete implementation, lifecycle, secret resolution)? →
   `platform/container.ts`, the composition root — the one place allowed to import concrete adapters
   and module repositories.

## What each ring may import

The inward rule, made concrete. Full table with rationale in **references/dependency-rules.md**.

- **`routes.ts`** → its own `service.ts`, `@devdigest/shared` contracts, `platform/errors`, the
  request-context helper. **Not** `drizzle-orm`/`db/schema`, an adapter implementation, or another
  module's internals.
- **`service.ts`** → `Container` (type), its `repository.ts`, `@devdigest/shared` contracts + ports,
  `reviewer-core`, `platform/errors`, its own `helpers`/`constants`. **Not** `drizzle-orm`/`db/schema`
  (no queries), a concrete adapter class (get it off the Container), Fastify types, or a sibling
  module's service/repository (use `container.<x>Repo`).
- **`repository.ts`** → `db/client`, `db/schema`, `db/rows`, `drizzle-orm`, `@devdigest/shared`. **The
  only ring that imports Drizzle.**
- **`adapters/*`** → its SDK, the port interface from `@devdigest/shared`, `platform/errors`. It
  *implements* the port. **Not** a module's service/repository, **not** Fastify.
- **`vendor/shared/*`** (domain core) → `zod` and other shared contracts. **Nothing else** — no
  Drizzle, no Fastify, no adapters, no SDKs.
- **`reviewer-core/src/*`** → `@devdigest/shared` + `zod` + its own internals. **Never** imports from
  `server/` (that would make the core depend on an outer ring).
- **`platform/container.ts`** → everything concrete. The composition root wires it all.

## Adding a new module

1. Create `server/src/modules/<name>/` with `routes.ts`, `service.ts`, `repository.ts` (add
   `helpers.ts` / `constants.ts` as needed). ESM relative imports carry the `.js` extension.
2. Put request/response shapes as Zod contracts in `vendor/shared/contracts/*` (or reuse existing).
3. `repository.ts` owns **all** Drizzle for the module; scope every query by `workspace_id`.
4. `service.ts` takes `Container` in its constructor; call the repository and pull adapters off the
   Container. No `new Adapter(...)`, no `process.env`.
5. `routes.ts` is a Fastify plugin: **schema-first** validation, resolve `getContext()` for
   `{ workspaceId, userId }`, throw `AppError`/`NotFoundError`/`ValidationError`/`ConfigError`,
   delegate to the service, and **map rows → a contract DTO** before returning.
6. Register the module **once** in `server/src/modules/index.ts` (one import + one `app.register`).

## Adding a new adapter / port

1. Declare the **interface** in `vendor/shared/adapters.ts` (the port — a plain TS interface).
2. Implement it in `server/src/adapters/<kind>/<impl>.ts`.
3. Add it to `ContainerOverrides` + a lazy getter in `platform/container.ts` (resolve secrets there,
   not in callers).
4. Add a mock to `server/src/adapters/mocks.ts` so tests inject it via `buildApp({ overrides })`.

## Architecture smells (flag these in review)

- **`import ... from 'drizzle-orm'`** or `db/schema` in a `routes.ts` or `service.ts` → a query
  escaped the repository. Move it into `repository.ts`.
- **`new OctokitGitHubClient(...)` / `new OpenAIProvider(...)`** (or any adapter) in a service/route →
  bypasses the Container. Resolve it via `container.<x>`.
- **`process.env.<KEY>`** for a secret in a handler/service → must go through
  `container.secrets.get(...)`; secrets are never logged.
- **`import { ... } from '../<other>/service.js'`** → a cross-module reach. Use a repository on the
  Container, or lift the shared piece to the Container.
- **Returning a raw row / `$inferSelect` from a route** → map to a Zod-contract DTO (e.g.
  `helpers.ts`) at the HTTP seam.
- **`import ... from 'fastify'`** (or any `server/` import) inside `reviewer-core` or a
  `vendor/shared` contract → framework/outer ring leaked into the core.
- **An inline `fetch` / `axios` / SDK call** in a service or route → wrap it behind a port in
  `adapters.ts` instead.
- **Hand-rolled `Schema.parse(req.body)`** in a handler → declare the schema in the route `schema`
  (fastify-type-provider-zod 422s invalid input before the handler).
- **A new external integration with no interface** → there must be a port in `adapters.ts` and a mock
  in `mocks.ts`, or it cannot be unit-tested.
