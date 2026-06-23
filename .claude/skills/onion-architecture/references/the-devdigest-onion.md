# The DevDigest onion — rings, trace, and recipes

The concentric rings mapped to the real codebase, a worked request trace, and step-by-step recipes.
Dependencies point **inward**: an outer ring may call any inner ring; an inner ring never imports an
outer one. (The canonical statement of that rule — Palermo's tenets, Martin's Dependency Rule — is in
the repo-root `onion-architecture-sources.md`.)

## The four rings, concretely

```
            ┌──────────────────────────────────────────────────────────┐
            │  PRESENTATION   server/src/modules/<name>/routes.ts       │   Fastify plugins
            │  ┌────────────────────────────────────────────────────┐  │   (registered in
            │  │  INFRASTRUCTURE                                     │  │    modules/index.ts)
            │  │   server/src/adapters/*   (port implementations)   │  │
            │  │   server/src/platform/*   (Container, jobs, sse…)  │  │
            │  │   server/src/db/*         (schema, client, migr.)  │  │
            │  │  ┌──────────────────────────────────────────────┐  │  │
            │  │  │  APPLICATION                                 │  │  │
            │  │  │   modules/<name>/service.ts    (use-cases)   │  │  │
            │  │  │   modules/<name>/repository.ts (data access) │  │  │
            │  │  │  ┌────────────────────────────────────────┐  │  │  │
            │  │  │  │  DOMAIN CORE                           │  │  │  │
            │  │  │  │   vendor/shared/contracts/*  (Zod)     │  │  │  │
            │  │  │  │   vendor/shared/adapters.ts  (ports)   │  │  │  │
            │  │  │  │   reviewer-core/src/*  (pure engine)   │  │  │  │
            │  │  │  └────────────────────────────────────────┘  │  │  │
            │  │  └──────────────────────────────────────────────┘  │  │
            │  └────────────────────────────────────────────────────┘  │
            └──────────────────────────────────────────────────────────┘
```

**Domain core** — `server/src/vendor/shared/`. The Zod contracts (`contracts/findings.ts`,
`platform.ts`, `trace.ts`, …) and the adapter *interfaces* (`adapters.ts`: `LLMProvider`,
`GitHubClient`, `GitClient`, `SecretsProvider`, `Embedder`, `CodeIndex`, `AuthProvider`). Plus
`reviewer-core/src/*`, the pure `diff → prompt → LLM → findings` engine. Imports `zod` and nothing
else infrastructural.

**Application** — `server/src/modules/<name>/`. `service.ts` orchestrates a use-case (it takes a
`Container`, calls the repository, pulls adapters off the Container, may call `reviewer-core`).
`repository.ts` is the data-access facade — the **only** layer that touches the DB for that domain —
composing query modules under `repository/` split by aggregate.

**Infrastructure** — the outer ring that *implements* the ports and wires everything.
`server/src/adapters/*` holds the concrete adapters (`github/octokit.ts`, `git/simple-git.ts`,
`llm/openai.ts`, `llm/anthropic.ts`, `secrets/local.ts`, …). `server/src/platform/*` holds the
Container (composition root), `JobRunner`, the SSE bus, `errors.ts`, `config.ts`. `server/src/db/*`
holds the Drizzle schema, client, and migrations.

**Presentation** — `server/src/modules/<name>/routes.ts`, a Fastify plugin doing schema-first
validation and delegating to the service, registered once in `server/src/modules/index.ts`.

## Why it is an *onion*, not just layers

The defining move: a **port is declared in the innermost ring and implemented in the outermost**. For
example `LLMProvider` is an interface in `vendor/shared/adapters.ts` (core), while
`OpenAIProvider`/`AnthropicProvider` live in `server/src/adapters/llm/` (infrastructure). The
application (`ReviewService`) depends on the **interface**, and the **Container** injects the concrete
at the edge:

```ts
// service.ts (application) — depends on the PORT, resolves via the Container
const llm = await this.container.llm(agent.provider);   // LLMProvider, not OpenAIProvider
const review = await reviewPullRequest({ diff, systemPrompt, llm, /* … */ });
```

Tests substitute a mock through `ContainerOverrides.llm` without touching the service — that
substitutability is the whole point of the inversion.

## A request trace (a review run)

1. **Presentation** — `modules/reviews/routes.ts` receives `POST /pulls/:id/review`. Zod
   `params`/`body` contracts validate it (422 before the handler). It resolves `getContext()` →
   `{ workspaceId }` and calls `new ReviewService(app.container).runReview(...)`.
2. **Application** — `ReviewService` (`service.ts`) loads the PR + repo via its `ReviewRepository`,
   creates the `agent_runs` row, and hands off to `ReviewRunExecutor`.
3. **Infrastructure (via ports)** — the executor pulls `await container.llm(agent.provider)` and
   `container.git`/`await container.github()` off the **Container** (concrete adapters resolved from
   secrets there), and streams progress over `container.runBus`.
4. **Domain core** — it calls `reviewPullRequest(...)` from `@devdigest/reviewer-core`: assemble
   prompt → `llm.completeStructured({ schema: Review })` → `groundFindings(...)`. Pure; the only side
   effect is the injected `LLMProvider`.
5. **Application → Infrastructure** — results persist through `ReviewRepository` (the only Drizzle
   caller), scoped by `workspace_id`.
6. **Presentation** — the handler maps rows → a Zod-contract DTO (`helpers.ts: reviewToDto`) and
   returns; Fastify serializes against the response contract.

Every arrow points inward or is mediated by the Container. No ring reaches around another.

## Recipe — add a new module

Say you add `modules/labels/` (CRUD over PR labels):

1. `server/src/modules/labels/{routes.ts, service.ts, repository.ts}` (+ `helpers.ts` for DTO
   mapping). Relative imports carry `.js`.
2. Add the request/response shapes as Zod contracts in `vendor/shared/contracts/` (or reuse). These
   are the boundary type *and* the DTO type.
3. `repository.ts`: a `LabelsRepository` class taking `Db`; all `drizzle-orm` + `db/schema` use lives
   here, every query `where(eq(t.labels.workspaceId, workspaceId))`.
4. `service.ts`: a `LabelsService` taking `Container`. Business rules here; data via the repository;
   any external call via a Container adapter. Throw `NotFoundError` etc. from `platform/errors`.
5. `routes.ts`: a Fastify plugin — declare contracts in the route `schema`, `getContext()` for the
   workspace, delegate to the service, map rows → contract DTO before returning.
6. Register once in `server/src/modules/index.ts`.

If the module needs a brand-new external dependency, do the adapter recipe **first**.

## Recipe — add a new adapter / port

Say the product needs to send Slack notifications:

1. **Port (core)** — add an interface to `vendor/shared/adapters.ts`:
   ```ts
   export interface SlackClient {
     postMessage(channel: string, text: string): Promise<{ ts: string }>;
   }
   ```
2. **Implementation (infrastructure)** — `server/src/adapters/slack/web-api.ts` implements
   `SlackClient` using the Slack SDK; it imports the port + its SDK + `platform/errors`, nothing else.
3. **Wire it in the composition root** — add `slack?: SlackClient` to `ContainerOverrides` and a lazy
   getter on `Container` that resolves the token via `this.secrets.get('SLACK_TOKEN')` (mirroring the
   `github()` getter).
4. **Mock** — add a `SlackClient` mock to `server/src/adapters/mocks.ts` so
   `buildApp({ overrides })` injects it; unit tests never hit the network.

Now any service depends on the **interface** and gets the concrete from `container.slack` — the new
capability obeys the inward rule from day one.

## reviewer-core — the reference pure core

`reviewer-core/` is the cleanest ring: `prompt.ts` (assemble + injection guard), `grounding.ts`
(citation gate), `review/run.ts` (the `reviewPullRequest` entry point), `llm/structured.ts` (Zod →
JSON Schema). It imports only `@devdigest/shared` and `zod`. It has **no** Fastify, DB, GitHub, or
filesystem dependency — its single side effect is the injected `LLMProvider`. Treat it as the
yardstick: if a change would make `reviewer-core` import anything from `server/`, the change belongs
in the application ring instead.
