# Persistence & contracts — Drizzle, Zod, and the mapping seam

How the DevDigest backend places its two most-coupling tools — **Drizzle** (persistence) and **Zod**
(boundary) — under the onion, and how it resolves the real debates about each. The wider research and
links are in the repo-root `onion-architecture-sources.md`.

## Drizzle lives in the repository

**Rule: all `drizzle-orm` and `db/schema` imports, and all query building, stay in `repository.ts`
and the colocated `repository/<aggregate>.repo.ts`.** The repository is the *only* layer that touches
the DB for its domain. `ReviewRepository` is the canonical example — a facade composing
`review.repo.ts`, `run.repo.ts`, `pull.repo.ts`, every query scoped by `workspace_id`.

Why here and nowhere else: persistence is the most volatile, most infrastructural concern, so it sits
at the outer edge. A service that builds a query has pulled the database into the application ring; a
route that does is worse. Keeping queries in one place also makes the workspace-scoping invariant
auditable — you can read every query for a domain in one folder.

### Queries vs. types — the nuance DevDigest actually follows

There is a well-known purist position (see `onion-architecture-sources.md` §3, the "rotten onion"
critique) that the domain must never even *reference* an ORM-inferred type — that
`type User = typeof users.$inferSelect` leaks the database shape inward. **DevDigest does not go that
far, and the skill should not pretend it does.** The real, lighter rule here:

- **Queries never escape the repository.** This is the hard line.
- **Row types *may* flow up to the service as the "persistence model."** The repository exposes
  `ReviewRow = typeof t.reviews.$inferSelect` and returns `PullRow`/`AgentRow` (from `db/rows.ts`);
  `ReviewService` consumes them. That is accepted — Drizzle is a typed SQL builder with no proxies or
  lazy loading, so a row type is just a shape, not a live ORM entity.
- **Rows are mapped to a Zod-contract DTO before crossing the HTTP boundary out.** `helpers.ts`
  (`reviewToDto`, `findingRowToDto`) converts `ReviewRow` → `ReviewDto` in the application ring; the
  route returns the DTO, never the raw row. Mapping happens **at the seam where the shape actually
  changes** (persistence → wire), not ceremonially at every layer.

So: *map at the HTTP seam, keep queries in the repository, and don't return `$inferSelect` rows from a
route.* That's the DevDigest middle way (research §5, Bozho's "map only when the shape diverges").

## Zod `@devdigest/shared` contracts are the shared domain + boundary type

DevDigest deliberately makes one Zod schema the single source of truth — it drives **request
validation, response serialization, AND LLM output** (CLAUDE.md). That places it in the
**schema-as-source-of-truth** camp, *not* the purist "the domain must not import Zod" camp. Two
consequences the skill enforces:

1. **Importing a `@devdigest/shared` contract from any ring is correct** — including the domain core
   and `reviewer-core`. It is not a layering violation. (The contracts depend only on `zod`, so the
   core stays infrastructure-free.)
2. **Validate at the edges; trust within.** "Parse, don't validate" at every boundary:
   - **HTTP in** — schema-first routes: declare the Zod `params`/`body` in the route `schema`
     (fastify-type-provider-zod 422s bad input before the handler). Never hand-roll
     `Schema.parse(req.body)`.
   - **HTTP out** — serialize against the response contract; return a DTO, not a row.
   - **LLM out** — the untrusted boundary. `reviewer-core` converts the Zod schema to JSON Schema,
     then `safeParse`s the model's reply (with reprompt-on-error). LLM output is treated exactly like
     user input — never trusted raw (research §4).

## The three representations and when to map

Three shapes are in play. Keep them straight, and only map where they genuinely differ:

| Representation | Type | Lives in | Example |
|---|---|---|---|
| **Persistence row** | Drizzle `$inferSelect` (`db/rows.ts`) | repository → service | `ReviewRow`, `PullRow` |
| **Boundary / DTO** | Zod contract (`vendor/shared/contracts/*`) | crosses HTTP; LLM I/O | `ReviewDto`, `Finding`, `Review` |
| **Domain value** | a contract type, or a service-local shape | application + core | `Intent`, `RunTrace` |

- **Map** when the shapes diverge — row → DTO at the HTTP seam (`helpers.ts`). Drop internal columns,
  reshape for the client, enrich (e.g. compute `cost_usd` at read time).
- **Share** when they coincide — a Zod contract that is already exactly the wire shape needs no second
  type. Don't add a mapper for a 1:1 passthrough; that's the ceremony the research warns against.

The test: *does the outward shape differ from the stored shape?* If yes, map; if no, share the
contract. Don't impose a mapper layer the codebase doesn't have.

## Secrets are infrastructure

API keys and tokens are resolved **only** through `SecretsProvider` (`container.secrets.get(...)`),
which the Container injects into adapters at construction. No ring reads `process.env` for a key, and
secrets are never logged or persisted to the DB. This is the same inversion as every other port: the
*interface* (`SecretsProvider`) is in the core, the *implementation* (`LocalSecretsProvider`, reading
`~/.devdigest/secrets.json`) is in `adapters/secrets/`.

## Keep `reviewer-core` pure

`reviewer-core` is the innermost ring and the purity yardstick. It imports `@devdigest/shared` + `zod`
only. Its structured-output path (`llm/structured.ts`) is the model boundary: Zod schema → JSON Schema
→ `safeParse` the reply → repair/retry. If a feature tempts you to give `reviewer-core` a DB handle, a
GitHub client, or a Fastify type, that feature belongs in the application ring (the module's
`service.ts`/`run-executor.ts`), which passes already-resolved data *into* the pure engine.
