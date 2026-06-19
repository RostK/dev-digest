# Dependency rules — the import matrix

The inward dependency rule, made enforceable. This is the heart of the skill: **source-code
dependencies may only point inward**, and the mechanism that lets an inner ring *use* an outer
capability without depending on it is **a port defined in the core and implemented outside**, injected
by the Container. (Theory + sources: repo-root `onion-architecture-sources.md`.)

## The one rule

> An outer ring may import and call any inner ring. **An inner ring must never import an outer ring.**

Outer → inner (allowed): a route imports its service; a service imports a contract; an adapter
implements a port. Inner → outer (a violation): a contract importing Drizzle; `reviewer-core`
importing Fastify; a service `new`-ing a concrete adapter.

The Container is the single licensed exception: as the **composition root** it sits at the outermost
edge and is *allowed* to import every concrete thing, because its only job is to wire them together
and hand inner rings their dependencies as interfaces.

## The matrix

| Ring / file | May import | Must NOT import | Why |
|---|---|---|---|
| **`modules/<m>/routes.ts`** (presentation) | its own `service.ts`; `@devdigest/shared` contracts; `platform/errors`; the request-context helper; Fastify types | `drizzle-orm` / `db/schema`; an adapter implementation; another module's internals; `reviewer-core` directly | routes are thin glue; data + orchestration belong to the service |
| **`modules/<m>/service.ts`** (application) | `Container` (type); its `repository.ts`; `@devdigest/shared` contracts + ports; `reviewer-core`; `platform/errors`; own `helpers`/`constants` | `drizzle-orm` / `db/schema` (no queries); a concrete adapter class; `fastify` types; a sibling module's service/repository | business logic depends on abstractions, never on infrastructure or HTTP |
| **`modules/<m>/repository.ts`** (+ `repository/*.repo.ts`) | `db/client`, `db/schema`, `db/rows`, `drizzle-orm`; `@devdigest/shared` | a service; an adapter; `fastify` | the single home for persistence; **the only ring that imports Drizzle** |
| **`adapters/<kind>/*`** (infrastructure) | its SDK (octokit, simple-git, openai…); the port interface from `@devdigest/shared`; `platform/errors` | a module's service/repository; `fastify` | an adapter *implements* a port and knows nothing about callers |
| **`platform/container.ts`** (composition root) | everything concrete — adapters, module repositories, config, db | — | the licensed wiring point; the **only** place that names concrete implementations |
| **`vendor/shared/*`** (domain core) | `zod`; other shared contracts | Drizzle; Fastify; adapters; any SDK; anything in `server/` outside `vendor/shared` | the core must compile and run with zero infrastructure |
| **`reviewer-core/src/*`** (pure core) | `@devdigest/shared`; `zod`; its own internals | **anything in `server/`**; Fastify; a DB client; `fs`; octokit | proves the core is framework-free; its only side effect is the injected `LLMProvider` |

## Ports and the Container

A **port** is a plain TypeScript interface in `vendor/shared/adapters.ts` (`LLMProvider`,
`GitHubClient`, `GitClient`, `SecretsProvider`, `Embedder`, `CodeIndex`, `AuthProvider`). Its
**adapter** is the concrete class in `server/src/adapters/<kind>/`. The application depends on the
port; the Container resolves the adapter:

```ts
// application: depends on the interface
async runReview(/* … */) {
  const llm = await this.container.llm(agent.provider);   // resolves OpenAIProvider | AnthropicProvider
  const gh  = await this.container.github();              // resolves OctokitGitHubClient (throws if no token)
}
```

The Container constructs adapters **lazily** and caches them, resolving secrets through
`SecretsProvider` at the edge — callers never see `process.env`. `ContainerOverrides` lets tests swap
any port for a mock without changing a single line of application code; that substitutability *is* the
return on the inversion.

### Cross-cutting data access

A module must not import another module's repository. DevDigest exposes shared repositories on the
Container instead — `container.agentsRepo`, `container.reviewRepo` — constructed in the composition
root. So `ReviewService` reads agents via `container.agentsRepo`, never via
`import … from '../agents/repository.js'`. If two modules need the same data access, lift it onto the
Container; do not reach sideways.

## Common violations and the fix

- **A query in a service** (`db.select()...` or `import { eq } from 'drizzle-orm'` in `service.ts`)
  → move it into `repository.ts` (or a `repository/<aggregate>.repo.ts`) and call it from the service.
- **`new OpenAIProvider(key)` in a service** → resolve `await container.llm('openai')`; let the
  Container own construction + secret lookup + caching.
- **`process.env.OPENAI_API_KEY` anywhere but the Container/secrets adapter** → `container.secrets.get('OPENAI_API_KEY')`.
- **`import { ReviewService } from '../reviews/service.js'` in another module** → expose what's needed
  as a repository/adapter on the Container, or call the HTTP API; don't couple modules directly.
- **A Fastify type in `reviewer-core` or a `vendor/shared` contract** → the inner ring is reaching
  out; move the framework-dependent code to the application/presentation ring.
- **An inline `fetch`/SDK call in application code** → define a port in `adapters.ts`, implement it in
  `adapters/`, wire it in the Container; only then call it from the service.

## Enforcement notes

DevDigest deliberately ships **no ESLint** (see CLAUDE.md), so these rules are enforced by **review +
this skill**, not a linter — do not add `eslint-plugin-boundaries` or `dependency-cruiser` config
unprompted. Two cheap manual checks when reviewing a module:

- `grep -n "drizzle-orm\|db/schema" modules/<m>/routes.ts modules/<m>/service.ts` → should be empty.
- `grep -rn "from '\.\./" modules/<m>/` for imports reaching into a *sibling* module → should be empty
  (the Container is the sanctioned sharing point).
