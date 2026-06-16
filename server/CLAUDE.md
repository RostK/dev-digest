# server — `@devdigest/api`

Fastify 5 + Drizzle ORM + Postgres (pgvector). ESM, run via tsx. Ports-and-adapters
behind a DI container.

## Commands

`pnpm dev` (:3001) · `pnpm db:migrate` · `pnpm db:seed` (idempotent demo data) ·
`pnpm db:generate` (after schema edits) · `pnpm typecheck`.

## Tests — split by FILENAME

`pnpm test` runs all. `*.it.test.ts` = DB-backed (real Postgres via testcontainers,
self-skips without Docker); everything else = hermetic unit (adapters mocked).
**A DB-backed test MUST use the `.it.test.ts` suffix** or the split breaks.

## Conventions

- **Module** = `modules/<name>/`: `routes.ts` (Fastify plugin) → `service.ts` →
  `repository.ts` (+ `constants.ts` / `helpers.ts`). Registered **statically** in
  `modules/index.ts` (one import + one `app.register`) — no autoload.
- **DI**: get adapters off the container (`container.git`, `await container.llm(id)`,
  `container.secrets.get(...)`). Don't `new` an adapter or import a sibling module's
  internals. Tests inject mocks via `buildApp({ db, overrides })` (`adapters/mocks.ts`).
- **Validation is schema-first**: declare zod `params`/`body` in the route `schema`
  (fastify-type-provider-zod) → invalid input is 422'd before the handler runs. Don't
  hand-roll `Schema.parse(req.body)`.
- **Errors**: throw `AppError` / `NotFoundError` / `ValidationError` / `ConfigError`
  from `platform/errors.ts` — not raw `new Error` in handlers.
- **Tenancy**: every route resolves `getContext()` → `{ workspaceId, userId }`; scope
  all queries by `workspace_id`.
- ESM relative imports carry the `.js` extension (`./helpers.js`).

## Do-not-touch

- Secrets only through `SecretsProvider` — don't read `process.env` for keys in
  handlers, and never log them.
- Don't add migrate-on-boot; migrations are an explicit step.

## Read when

- Need the full API/route map or the request + DI flow → read `server/README.md`.
- Working on repo indexing, the repo map, or blast radius → read
  `src/modules/repo-intel/README.md`.
