# DevDigest

Local-first AI pull-request reviewer (course starter template). Add a repo → it's
cloned + indexed → import PRs from GitHub → run an agent review → grounded findings.

## Layout — separate packages, NOT a pnpm workspace

Each package has its own `package.json` + lockfile. Cross-package code is shared via
tsconfig path aliases (source, not published modules) — don't run `pnpm -w` or add a
root workspace.

| Dir | Package | What | Port | PM |
|-----|---------|------|------|----|
| `server/` | `@devdigest/api` | Fastify 5 + Drizzle/Postgres (pgvector) | 3001 | pnpm |
| `client/` | `@devdigest/web` | Next.js 15 studio UI | 3000 | pnpm |
| `reviewer-core/` | `@devdigest/reviewer-core` | pure engine: diff→prompt→LLM→findings | — | npm |
| `e2e/` | `@devdigest/e2e` | deterministic browser e2e (no LLM) | — | npm |
| `server/src/vendor/shared` | `@devdigest/shared` | Zod contracts for every package | — | — |

Aliases: `@devdigest/shared`, `@devdigest/reviewer-core` (→ `../reviewer-core/src`,
consumed as **source**, never built to JS), `@devdigest/ui` (client only).

## Run

`./scripts/dev.sh` (bash) → Postgres (Docker) + API + web. Only Postgres runs in Docker.
Dev machine is Windows + PowerShell, but `scripts/*.sh` are bash → run via Git Bash/WSL.

## Gotchas

- **Migrations are NOT applied on boot** → `cd server && pnpm db:migrate`.
- The server imports `reviewer-core` at runtime → install its deps too (it uses `npm`).
- `@devdigest/shared` Zod contracts are the single source of truth (drive request
  validation, response serialization, AND LLM output). Edit the contract, not copies.
- No eslint/prettier/editorconfig — match surrounding style; don't add a linter unprompted.
- Commits: Conventional Commits — `feat(scope): …`, `fix(...)`, `chore(...)`, `ci(...)`.

## Do-not-touch

- This is a **course starter**: the DB schema ships *every* table and the engine
  accepts prompt slots that later lessons fill. Empty tables / unused slots are
  intentional — not bugs to "fix".
- Secrets live in `~/.devdigest/secrets.json` (mode 0600) — never commit them to git,
  the DB, or logs.
- Never hand-edit `server/src/db/migrations/` (regenerate via `pnpm db:generate`) or
  fork the `server/src/vendor/shared/` contracts — they're the source of truth and
  ripple to every package.

## Use when

These docs are curated and often already answer the question — read the relevant one
*before* reading code, then go to the source:

- Changing the review pipeline / prompt assembly / grounding → read `reviewer-core/README.md`.
- Adding or changing API routes, a module, or the DI/request flow → read `server/README.md`.
- Working on repo indexing, the repo map, or blast radius → read
  `server/src/modules/repo-intel/README.md`.
- Touching UI routes or data hooks → read `client/README.md`.
- Adding/moving tests, or unsure about the unit vs integration split → read `TESTING.md`.
- Writing a feature spec / requirements *before* planning or coding → run the `write-spec`
  skill; SDD specs live in `specs/` (see `specs/README.md`).
- Need the product overview or what each course lesson (L01–L08) adds → read `README.md`.
