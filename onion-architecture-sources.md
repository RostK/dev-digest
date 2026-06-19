# Onion Architecture (backend) — sources for the skill

Collected and verified: June 2026. Raw, topic-grouped source list for the upcoming
**backend "Onion Architecture"** skill (Fastify + Drizzle + Zod + Postgres, DevDigest stack).
These go into the skill's `README.md` "Sources" section later — keep this annotated master copy.

**Legend:**
- ⭐ — anchor / canonical source (read first)
- ⚠️ — outdated, version-specific, or could-not-verify (include only with context)
- 🔁 — opinion, not consensus (present as one side of a debate)

> Link-fidelity note: every URL below was either opened with WebFetch or appeared verbatim in
> WebSearch results during research; URLs are copied exactly. Items flagged ⚠️/"not opened" were
> seen in results but not independently fetched — verify before citing in the README.

---

## 0. Canonical theory — Onion Architecture (read first)

- ⭐ **The Onion Architecture: part 1** — Jeffrey Palermo (29 Jul 2008)
  https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/
  The origin. Coins the term; critiques traditional N-tier coupling ("each layer coupled to the
  layers below it and to infrastructure"); the governing rule: *all coupling is toward the center.*
  Scopes it to long-lived, complex business apps (not small/throwaway sites). **Verified — loads.**

- ⭐ **The Onion Architecture: part 2** — Jeffrey Palermo (Jul 2008)
  https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/
  The layers (Domain Model → Domain Services → Application Services → outer ring) + "all
  dependencies toward the center" + interfaces-defined-in-the-core (CodeCampServer example).
  **Verified — loads.**

- ⭐ **The Onion Architecture: part 3** — Jeffrey Palermo (Aug 2008)
  https://jeffreypalermo.com/2008/08/the-onion-architecture-part-3/
  Onion vs. traditional layered architecture; data access moves from a "middle layer" to a
  "top/outer layer." **Verified — loads.**

- ⭐ **Onion Architecture: Part 4 — After Four Years** — Jeffrey Palermo (Aug 2013)
  https://jeffreypalermo.com/2013/08/onion-architecture-part-4-after-four-years/
  The most quotable formulation — the four canonical tenets: (1) built around an independent object
  model; (2) inner layers define interfaces, outer layers implement them; (3) coupling points toward
  the center; (4) core compiles & runs separate from infrastructure. Clarifies an IoC container is
  *optional*. **Verified — loads.**
  (Note: Parts 1–3 cross-link via old `jeffreypalermo.com/blog/...` paths that now redirect; the
  date-based URLs above are the working canonical ones.)

## 1. Onion vs Hexagonal vs Clean (the family)

- ⭐ **The Clean Architecture** — Robert C. Martin / "Uncle Bob" (13 Aug 2012)
  https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html
  The verbatim Dependency Rule ("source code dependencies can only point inwards"); the four rings
  (Entities → Use Cases → Interface Adapters → Frameworks & Drivers); explicitly a *synthesis* of
  Hexagonal, **Onion**, DCI, and BCE. **Verified — loads.**

- **Hexagonal architecture (Ports & Adapters)** — Wikipedia
  https://en.wikipedia.org/wiki/Hexagonal_architecture_(software)
  Cockburn's pattern: origin, the 2005 "Ports and Adapters" rename, ports/adapters mechanism,
  driving vs driven sides, relationship to Onion/Clean. **Verified — loads.** (Used because
  Cockburn's own page failed — see below.)

- ⚠️ **Hexagonal Architecture** — Alistair Cockburn (author's own page)
  https://alistair.cockburn.us/hexagonal-architecture/
  Canonical primary source for Hexagonal, **but COULD NOT VERIFY** — WebFetch failed with
  "certificate has expired." Confirm it loads before putting it in the README.

- **Hexagonal Architecture and Clean Architecture (with examples)** — Dyarlen Iber, DEV
  https://dev.to/dyarleniber/hexagonal-architecture-and-clean-architecture-with-examples-48oi
  Clear walkthrough of how Hexagonal vs Clean relate: the Dependency Rule, ports/adapters, the
  4-layer model, with a TypeScript use-case example. Well-regarded.

## 2. Applying Onion/Clean to a Node + TypeScript + Fastify backend

- ⭐ **Domain-Driven Hexagon** — Sairyss, DEV article
  https://dev.to/sairyss/domain-driven-hexagon-18g5
  DDD + hexagonal/onion/clean with TS examples; feature-modules each split into
  domain/application/infrastructure. Companion to a very popular GitHub repo.

- ⭐ **Domain-Driven Hexagon (repo)** — Sairyss
  https://github.com/Sairyss/domain-driven-hexagon
  The reference repo for the above; modules-by-feature, internally layered. Well-starred.

- **Clean Architecture with TypeScript: DDD, Onion** — André Bazaglia
  https://bazaglia.com/clean-architecture-with-typescript-ddd-onion/
  Concrete TS onion layout (`domain` / `app` / `infra` / `api`), entity factory methods, repository
  mappers. Engineering blog, good quality.

- ⭐ **Repository, DTO & Mapper in TypeScript DDD** — Khalil Stemmler
  https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper/
  The definitive TS treatment of Repository + DTO + Mapper (slim generic `Repo<T>` base, per-aggregate
  extension, three-way mapping). Recognized authority on DDD/TypeScript.

- **Clean Architecture in Node.js: Repository Pattern with TypeScript and Prisma** — Alex Rusin
  https://blog.alexrusin.com/clean-architecture-in-node-js-implementing-the-repository-pattern-with-typescript-and-prisma/
  Practical repository-pattern walkthrough; interfaces in core / implementations in infra. Solid.

- **Clean Architecture — Fastify + MongoDB (template repo)** — borjatur
  https://github.com/borjatur/clean-architecture-fastify-mongodb
  Fastify-specific clean-architecture template: `core/` (entities, repository *interfaces*, services)
  vs `infrastructure/http` (Fastify) + `infrastructure/repositories` (implementations). On-topic for Fastify.

- **Yet another vision of Clean Architecture** — borjatur (7 Mar 2023)
  https://borjatur.com/2023/03/07/yet-another-vision-of-clean-architecture/
  Companion blog post explaining the reasoning behind the template above.

- ⚠️ **node-typescript-architecture** — jbreckmckye
  https://github.com/jbreckmckye/node-typescript-architecture
  Opinionated hexagonal/ports-and-adapters Node+TS template (functional style). **Partial load** — the
  README excerpt lacked the folder tree; full structure is in the companion GitBook
  `https://jbreckmckye.gitbook.io/node-ts-architecture/` (not independently fetched).

- ⚠️ **Onion Architecture in Node.js with TypeScript** — Sankhadip, Medium
  https://sankhadip.medium.com/onion-architecture-in-node-js-with-typescript-5508612a4391
  Intro-level walkthrough; appeared in search results but **not opened** — lower priority, verify first.

### Where Fastify fits (presentation + composition root)

- ⭐ **fastify-awilix** — official Fastify DI plugin
  https://github.com/fastify/fastify-awilix
  Singleton (`app.diContainer`) vs request-scoped (`request.diScope`) lifetimes, `asClass`/`asFunction`,
  route resolution, disposal via hooks. Keeps Fastify at the composition root. Authoritative (Fastify org).

- ⭐ **Encapsulation** — Fastify docs
  https://fastify.dev/docs/latest/Reference/Encapsulation/
  Plugin encapsulation contexts (child inherits parent decorators/hooks; parent can't see child),
  `fastify-plugin` to deliberately break encapsulation. The DI/boundary mechanism. Official docs.

### Dependency injection options in TypeScript

- **awilix vs inversify vs tsyringe** — npm-compare
  https://npm-compare.com/awilix,inversify,tsyringe
  Decorator vs non-decorator, `reflect-metadata` requirement, stars/maintenance. Supports the
  "awilix (or plain constructor injection) keeps the domain framework-free" point. Data-backed.

### Folder organization debate (layer-based vs feature-based)

- 🔁 **Clean Architecture is not about folders — feature-based design works better** — Vinod Jagwani, Medium
  https://medium.com/@vinodjagwani/clean-architecture-is-not-about-folders-feature-based-design-works-better-d349e920dcf1
  Argues clean architecture is about *dependency direction*, not folder names; makes the
  package-by-feature case + a hybrid recommendation. Opinion — one side of the debate.

- 🔁 **Layered Architecture vs Feature Folders** — Saber Amani, DEV
  https://dev.to/saber-amani/layered-architecture-vs-feature-folders-43lm
  Direct comparison; debate framing.

## 3. Drizzle ORM as the infrastructure / persistence layer

- ⭐ **Atomic Repositories in Clean Architecture and TypeScript** — Sentry blog
  https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/
  Strongest source on transactions: an *incomplete* `ITransaction` interface kept import-free in the
  application layer, implemented with Drizzle in infrastructure; `const invoker = tx ?? db;` routing;
  a `TransactionManagerService` threading the tx through layers; nested tx → savepoints.

- ⭐ **Vertical-slice + Clean Architecture (Elysia/Drizzle)** — RezaOwliaei (gist)
  https://gist.github.com/RezaOwliaei/477ed74fc77aa5df2a854789538dd79d
  Most directly on-point: `application/ports/IUserRepository.ts` (interface) ←
  `infrastructure/repositories/DrizzleUserRepository.ts` (impl); schema in `infrastructure/schema/`;
  **type-only imports** to avoid runtime coupling; the `create()` vs `restore()`/rehydration mapping pattern.

- **Repository Pattern in NestJS with Drizzle ORM** — Vimulatus, Medium
  https://medium.com/@vimulatus/repository-pattern-in-nest-js-with-drizzle-orm-e848aa75ecae
  db client in a `@Global()` DI module, repositories *injected* (never importing the client),
  `nestjs-cls` `@Transactional()` hiding Drizzle's tx API.

- ⭐ **Drizzle "Goodies"** — official docs
  https://orm.drizzle.team/docs/goodies
  `$inferSelect` / `$inferInsert` and `InferSelectModel` / `InferInsertModel`. The ergonomic win —
  *and* the leak risk: these types *are* the DB shape, so `type User = typeof users.$inferSelect`
  couples the domain to a Drizzle table.

- 🔁 **The rotten onion** — maschmi
  https://blog.maschmi.net/rottenOnion/
  Cautionary tale: merging domain + persistence entities drags ORM concerns (lazy loading,
  bidirectional relations, ORM-controlled instantiation) into the core. Notes Drizzle is *lighter*
  (typed SQL builder, no proxies/lazy loading) so the risk is smaller — but `$inferSelect`-as-domain
  is the TS-flavored version of the same mistake.

## 4. Zod as the boundary / contract layer

- ⭐ **Parse, don't validate** — Alexis King (5 Nov 2019)
  https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/
  The canonical essay. A parser preserves the proof in the type system; validate at the boundary, as
  early as possible; make illegal states unrepresentable. Zod's `parse`/`safeParse` are parsers.

- **Zod + LLMs: validate AI responses** — Pavel Espitia, DEV
  https://dev.to/pavelespitia/zod-llms-how-to-validate-ai-responses-without-losing-your-mind-4c5j
  "Never trust LLM output — validate at the boundary like user input." Defensive JSON extraction →
  `safeParse` → discriminated-union errors → re-inject Zod errors into the prompt for self-correcting
  retries. Directly relevant to reviewer-core's structured-output parsing.

- 🔁 **The Joy of Single Sources of Truth** — codinsonn, DEV
  https://dev.to/codinsonn/the-joy-of-single-sources-of-truth-277o
  Schema-as-domain-source-of-truth camp: "the schema should belong to the domain," feeding UI + API +
  types. One side of the where-do-Zod-schemas-belong debate (the side DevDigest leans toward).

- 🔁 **Using Zod schemas as a source of truth** — All Things TypeScript
  https://www.allthingstypescript.dev/p/using-zod-schemas-as-source-of-truth
  "Derive types from the Zod schema, not the other way around." `z.infer` as the single source.

- 🔁 **Isolated declarations and Zod** — Chris Krycho
  https://v5.chriskrycho.com/notes/isolated-declarations-and-zod/
  The trade-off of the schema-first (Zod DSL) approach vs type-first (Serde): expressive parsing at
  the cost of a less-legible resulting type, plus a runtime-library dependency.

- **When to use Zod (and when plain TS)** — LogRocket
  https://blog.logrocket.com/when-use-zod-typescript-both-developers-guide/
  Validate *untrusted external* data at entry points; plain TS types for *trusted internal* data.

## 5. Postgres/pgvector + the mapping problem (map vs share types)

- **On DTOs** — Bozho
  https://techblog.bozho.net/on-dtos/
  Both sides of map-vs-share; the pragmatic "middle way" — separate DTOs/entities only when the shape
  *meaningfully diverges* from the row; share otherwise.

- **DTOs & Mapping: the good, the bad, and the excessive** — CodeOpinion
  https://codeopinion.com/dtos-mapping-the-good-the-bad-and-the-excessive/
  "Inside data vs outside data"; decoupling internal models from external contracts; when mapping is
  ceremony vs necessary.

- **Onion Architecture in ASP.NET Core** — Code Maze
  https://code-maze.com/onion-architecture-in-aspnetcore/
  Onion overview (inward dependency rule, persistence at the boundary, domain↔DB mapping). Language is
  C#, but the layering concepts transfer; good for the "DB is the outermost ring" framing.

---

## DevDigest-specific decisions (how the skill resolves the open debates)

These are *our* calls — grounded in CLAUDE.md and the actual codebase — that the skill should encode
rather than leaving "it depends":

1. **Zod `@devdigest/shared` contracts are the shared domain + boundary type** (single source of truth
   for request validation, response serialization, AND LLM output). DevDigest sits in the
   *schema-as-source-of-truth* camp (§4, codinsonn / allthingstypescript), **not** the purist
   "domain must not import Zod / map at every seam" camp. The skill must not flag importing a shared
   contract as a violation.
2. **The Container (`server/src/platform/container.ts`) is THE composition root.** All adapter wiring
   happens there; services depend on the `Container`, never on concrete adapters. (Maps to Palermo
   tenet 2 + the fastify-awilix composition-root pattern — though we use a hand-rolled Container, not
   awilix.)
3. **Adapter interfaces in `server/src/vendor/shared/adapters.ts` are the ports;** concrete
   implementations live in `server/src/adapters/*`. Inner defines the interface, outer implements it.
4. **Drizzle stays in `repository.ts` / `repository/*.repo.ts` (infrastructure).** Routes and service
   business logic never import Drizzle or touch SQL. (§3.)
5. **`reviewer-core` is the purest core** — diff→prompt→LLM→findings with no Fastify/DB/filesystem;
   its only side effect is the injected `LLMProvider`. The skill treats it as the reference example of
   a framework-free core (Palermo tenet 4).
6. **Mapping is light, not absent:** DTO converters already live in `helpers.ts` (`ReviewRow →
   ReviewDto`). The skill endorses mapping at the persistence/HTTP seam where shapes diverge, but does
   not demand a mapper where the shared contract already *is* the shape (per decision 1).

## Could not verify / verify before README

- ⚠️ `https://alistair.cockburn.us/hexagonal-architecture/` — cert expired at research time.
- ⚠️ `https://jbreckmckye.gitbook.io/node-ts-architecture/` — companion GitBook, not fetched.
- ⚠️ `https://sankhadip.medium.com/onion-architecture-in-node-js-with-typescript-5508612a4391` — not opened.
