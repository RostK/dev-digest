# onion-architecture — skill README

> Human-facing documentation for the `onion-architecture` skill.
> The operational instructions Claude loads live in [SKILL.md](SKILL.md); deep reference material is
> under [references/](references/). This README captures the skill's purpose, scope, relationships to
> other skills, version, and the sources it was built from.

## Focus

**Onion / ports-and-adapters / layered architecture for the DevDigest backend** — the decisions about
**which ring backend code lives in and which way its dependencies may point** across the `server/`
Fastify modules and the `reviewer-core` engine.

The DevDigest backend is *already* onion-shaped (the explore of the codebase confirmed a clean
four-ring mapping). This skill's job is to make that implicit structure **explicit and enforceable**,
so every new or changed module follows the pattern the `reviews/` module already demonstrates rather
than letting the layering erode. It covers **boundaries and placement only** — not the syntax of the
tools inside each ring.

## What it covers

- **The four rings** mapped to the real folders — domain core (`vendor/shared` contracts + adapter
  ports; `reviewer-core`), application (`service.ts` + `repository.ts`), infrastructure
  (`adapters/*`, `platform/*`, `db/*`), presentation (`routes.ts`).
- **The inward dependency rule** — an import matrix of what each ring may and must not import, with
  the rationale, plus the two cheap manual checks that catch the common violations.
- **Ports & the composition root** — interfaces in `vendor/shared/adapters.ts`, implementations in
  `adapters/*`, all wired in the `Container`; services depend on interfaces and resolve concretes off
  the Container; cross-cutting data access shared via `container.<x>Repo`, never a sibling import.
- **Persistence & contracts** — Drizzle queries confined to the repository, the row → DTO
  map-at-the-seam rule, Zod `@devdigest/shared` contracts as the shared domain + boundary type,
  "parse, don't validate" at every edge (HTTP in/out, LLM output), and secrets isolation.
- **Recipes** — step-by-step for adding a new module and for adding a new adapter/port.
- **An architecture-smells checklist** for reviews.

## When to use it

- Adding or changing a `server/` module (route / service / repository).
- Adding an external integration, or deciding where an SDK/network/disk call belongs.
- Wiring something into the DI `Container`, or deciding whether a route/service may import Drizzle, an
  adapter, or another module.
- Reviewing a module's layering, or keeping `reviewer-core` framework-free.
- Deciding where a Zod contract or a persistence-to-DTO mapping should live.

## Related skills (and how this one differs)

This skill is intentionally narrow so it complements rather than duplicates the others:

| Skill | Scope | Boundary vs this skill |
|-------|-------|------------------------|
| **onion-architecture** (this) | **Where** backend code lives — rings, placement, import boundaries, the Container | — |
| `drizzle-orm-patterns` | **How** to write Drizzle — schema, queries, relations, transactions, migrations | Use it for query syntax; use this skill for *which layer the query lives in*. |
| `fastify-best-practices` | **How** Fastify works — routes, plugins, hooks, validation, serialization | Use it for route mechanics; use this skill for *routes as a thin presentation ring*. |
| `postgresql-table-design` | Postgres schema/index/constraint design | Use it for table design; this skill only treats the DB as the outermost ring behind a repository. |
| `zod` | Zod schema/validation syntax | Use it for writing schemas; this skill decides *where contracts sit and how they cross boundaries*. |
| `fastify-best-practices` + `typescript-expert` | framework + type-level depth | Orthogonal — language/framework detail, not layering. |
| `frontend-ui-architecture` | **Where** frontend (React/Next.js) code lives | The frontend sibling of this skill; same philosophy, other half of the stack. |

Rule of thumb: **this skill decides the rings and boundaries; the others decide the code inside them.**

## Version

**1.0.0** — current (2026-06-19). See changelog below.

Versioning policy (semver):
- **patch** — wording/clarity fixes, link updates, no guidance change.
- **minor** — new rules, new reference files, or expanded coverage that's backward-compatible.
- **major** — a change in recommended structure/conventions that would contradict prior guidance.

The version is also recorded in the `version:` field of [SKILL.md](SKILL.md) frontmatter.

### Changelog

- **1.0.0** (2026-06-19) — Initial skill: `SKILL.md` + `references/the-devdigest-onion.md`,
  `references/dependency-rules.md`, `references/persistence-and-contracts.md`, and `evals/evals.json`.
  Grounded in the real `server/` codebase (Container, `vendor/shared/adapters.ts`, the `reviews`
  module) and the verified source list below.

---

## Sources

Built from the verified research in the repo-root `onion-architecture-sources.md` (the full annotated
master copy, with per-source notes, dates, and verification flags). Legend: ⭐ anchor/canonical ·
⚠️ outdated/version-specific or could-not-verify · 🔁 opinion, not consensus.

### Canonical theory

- ⭐ The Onion Architecture, part 1 — Jeffrey Palermo — https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/
- ⭐ The Onion Architecture, part 2 — Jeffrey Palermo — https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/
- ⭐ The Onion Architecture, part 3 — Jeffrey Palermo — https://jeffreypalermo.com/2008/08/the-onion-architecture-part-3/
- ⭐ Onion Architecture, part 4 — After Four Years — Jeffrey Palermo — https://jeffreypalermo.com/2013/08/onion-architecture-part-4-after-four-years/

### Onion vs Hexagonal vs Clean

- ⭐ The Clean Architecture — Robert C. Martin — https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html
- Hexagonal architecture (Ports & Adapters) — Wikipedia — https://en.wikipedia.org/wiki/Hexagonal_architecture_(software)
- ⚠️ Hexagonal Architecture — Alistair Cockburn (cert expired at research time; verify) — https://alistair.cockburn.us/hexagonal-architecture/
- Hexagonal & Clean Architecture with examples — Dyarlen Iber, DEV — https://dev.to/dyarleniber/hexagonal-architecture-and-clean-architecture-with-examples-48oi

### Onion/Clean in a Node + TypeScript + Fastify backend

- ⭐ Domain-Driven Hexagon (article) — Sairyss — https://dev.to/sairyss/domain-driven-hexagon-18g5
- ⭐ Domain-Driven Hexagon (repo) — Sairyss — https://github.com/Sairyss/domain-driven-hexagon
- Clean Architecture with TypeScript: DDD, Onion — André Bazaglia — https://bazaglia.com/clean-architecture-with-typescript-ddd-onion/
- ⭐ Repository, DTO & Mapper in TypeScript DDD — Khalil Stemmler — https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper/
- Clean Architecture in Node.js: Repository Pattern (TS + Prisma) — Alex Rusin — https://blog.alexrusin.com/clean-architecture-in-node-js-implementing-the-repository-pattern-with-typescript-and-prisma/
- Clean Architecture — Fastify + MongoDB (template) — borjatur — https://github.com/borjatur/clean-architecture-fastify-mongodb
- Yet another vision of Clean Architecture — borjatur — https://borjatur.com/2023/03/07/yet-another-vision-of-clean-architecture/
- ⚠️ node-typescript-architecture (GitBook not fetched) — jbreckmckye — https://github.com/jbreckmckye/node-typescript-architecture
- ⚠️ Onion Architecture in Node.js with TypeScript (not opened) — Sankhadip — https://sankhadip.medium.com/onion-architecture-in-node-js-with-typescript-5508612a4391

### Fastify as presentation + composition root, and DI

- ⭐ fastify-awilix (official DI plugin) — https://github.com/fastify/fastify-awilix
- ⭐ Encapsulation — Fastify docs — https://fastify.dev/docs/latest/Reference/Encapsulation/
- awilix vs inversify vs tsyringe — npm-compare — https://npm-compare.com/awilix,inversify,tsyringe

### Folder organization debate

- 🔁 Clean Architecture is not about folders — feature-based design — Vinod Jagwani — https://medium.com/@vinodjagwani/clean-architecture-is-not-about-folders-feature-based-design-works-better-d349e920dcf1
- 🔁 Layered Architecture vs Feature Folders — Saber Amani, DEV — https://dev.to/saber-amani/layered-architecture-vs-feature-folders-43lm

### Drizzle as the persistence layer

- ⭐ Atomic Repositories in Clean Architecture and TypeScript — Sentry — https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/
- ⭐ Vertical-slice + Clean Architecture (Elysia/Drizzle) — RezaOwliaei (gist) — https://gist.github.com/RezaOwliaei/477ed74fc77aa5df2a854789538dd79d
- Repository Pattern in NestJS with Drizzle ORM — Vimulatus — https://medium.com/@vimulatus/repository-pattern-in-nest-js-with-drizzle-orm-e848aa75ecae
- ⭐ Drizzle "Goodies" (inferred types) — official docs — https://orm.drizzle.team/docs/goodies
- 🔁 The rotten onion — maschmi — https://blog.maschmi.net/rottenOnion/

### Zod as the boundary / contract layer

- ⭐ Parse, don't validate — Alexis King — https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/
- Zod + LLMs: validate AI responses — Pavel Espitia, DEV — https://dev.to/pavelespitia/zod-llms-how-to-validate-ai-responses-without-losing-your-mind-4c5j
- 🔁 The Joy of Single Sources of Truth — codinsonn, DEV — https://dev.to/codinsonn/the-joy-of-single-sources-of-truth-277o
- 🔁 Using Zod schemas as a source of truth — All Things TypeScript — https://www.allthingstypescript.dev/p/using-zod-schemas-as-source-of-truth
- 🔁 Isolated declarations and Zod — Chris Krycho — https://v5.chriskrycho.com/notes/isolated-declarations-and-zod/
- When to use Zod (and when plain TS) — LogRocket — https://blog.logrocket.com/when-use-zod-typescript-both-developers-guide/

### Mapping: map vs share types

- On DTOs — Bozho — https://techblog.bozho.net/on-dtos/
- DTOs & Mapping: the good, the bad, and the excessive — CodeOpinion — https://codeopinion.com/dtos-mapping-the-good-the-bad-and-the-excessive/
- Onion Architecture in ASP.NET Core — Code Maze — https://code-maze.com/onion-architecture-in-aspnetcore/

> The full annotated version of this list (with per-source notes, dates, verification flags, and the
> DevDigest-specific decisions that resolve the open debates) is kept in `onion-architecture-sources.md`
> at the repository root.
