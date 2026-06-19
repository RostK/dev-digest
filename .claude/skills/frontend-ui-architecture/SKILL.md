---
name: frontend-ui-architecture
description: "Frontend UI architecture and code organization for React & Next.js — deciding WHERE code should live (folder/file structure, feature- vs type-based layout, colocation, where components / hooks / business logic / utils / constants / types / Server Actions belong, module boundaries and imports, and organizing the Server/Client boundary). Use this skill WHENEVER the user asks how to structure or organize a React/Next.js project, where a file/component/hook/type should go, how to split a large component, where to put business logic or data access, utils-vs-lib-vs-helpers, or barrel files — or asks for an architecture/structure review — even if they don't say the word 'architecture' and even though such questions can look answerable directly. Structure & organization only — not in-component coding rules (use react-best-practices) or Next.js API/feature mechanics (use next-best-practices)."
when_to_use: "Trigger phrases: 'where should this file/component/hook go', 'how should I structure the folders', 'feature-based vs type-based', 'where do I put business logic / constants / types', 'utils vs helpers vs lib vs services', 'should I use barrel files', 'where does the API/data layer live', 'organize this React/Next project', 'review the project architecture', 'where to put use client / Server Actions'."
version: 1.1.0
---

# Frontend UI Architecture & Code Organization

Decisions about **where code lives and how the project is organized** for React & Next.js apps:
folder structure, file placement, module boundaries, and the Server/Client boundary as an
organizational concern.

This skill is about **structure**, not coding style. For in-component correctness and
anti-patterns (hooks, state, rendering, memoization) use **react-best-practices**; for Next.js
API/feature usage (RSC mechanics, data APIs, metadata, optimization) use **next-best-practices**.

## Opinionated defaults

When the honest answer is "it depends," default to these — they're the calls worth committing to
explicitly, the ones that keep a codebase from drifting. The detail behind each is below.

- **Feature-first for anything that will grow.** `src/{app, components/ui, features/<domain>, lib,
  hooks, utils, types, config}`. Type-only folders are fine for a throwaway; commit to features past
  ~15–20 components instead of relitigating it later.
- **A feature is a folder with one public `index.ts`; features never import each other's internals.**
  Enforce it (ESLint `import/no-restricted-paths`), don't just intend it — this is the boundary that
  prevents the mess.
- **`lib/` = stateful integrations (db, auth, SDK clients); `utils/` = pure functions.** Never a
  junk-drawer `utils.ts` — name files by what they provide (`date.ts`, `currency.ts`).
- **The UI never reaches the network/DB directly.** Component → custom hook → API/data layer. In
  Next.js, a `server-only` data-access layer is the *sole* reader of `process.env`/DB; Server Actions
  stay thin and delegate to it. **Secrets never enter a `"use client"` module graph.**
- **Next.js Server/Client:** Server Components by default; `"use client"` only on interactive leaves;
  pass Server Components as `children` into Client Components (a Client Component can't import one);
  wrap context in a small client `Providers` so the rest of the tree stays server-rendered.
- **Promote to shared only on the second use.** Tolerate duplication until then (AHA); a
  single-consumer abstraction is premature.

## Reference files

Load on demand — keep this file in context, open a reference only when the task needs that depth.

- **[references/folder-structure.md](references/folder-structure.md)** — concrete folder trees
  (React/Vite + Next.js App Router), the feature-folder anatomy, and the scaling progression.
- **[references/where-things-go.md](references/where-things-go.md)** — deep definitions: utils vs
  helpers vs lib vs services, constants, type placement, and where business logic belongs.
- **[references/nextjs-app-router.md](references/nextjs-app-router.md)** — Next.js App Router
  organization: routing conventions, the Server/Client boundary, Server Actions, the data-access layer.

## Decision framework

Apply these in order — they resolve most "where does this go?" questions.

1. **Start simple; scale the structure to the app.** A small app needs a flat `src/` with a few
   folders. Introduce `features/` and deeper boundaries only when the app grows. Don't pre-build
   structure for scale you don't have.
2. **Colocate by default.** Put code next to where it's used. A file used by one component/route/
   feature lives beside it — not in a global folder.
3. **Promote to shared only on the second use.** When a second feature needs something, lift it to a
   shared top-level folder. One consumer = keep it local (avoid premature shared abstractions).
4. **Organize by feature/domain, not by file type, at scale.** Group by what the code does (`auth`,
   `billing`), not what it is (`all-components`, `all-hooks`). Type-based grouping is fine for small apps.
5. **Dependencies flow one direction:** shared (`components`, `hooks`, `lib`, `utils`, `types`) →
   `features` → `app`/routing. **No cross-feature imports.** If two features share code, lift it to shared.
6. **Consistency beats correctness.** Any sane layout applied consistently beats mixing conventions.
   Match the project's existing structure before introducing a new one.

## Folder structure

- Baseline `src/`: `app/` (or routing), `components/` (shared UI), `features/`, `hooks/`, `lib/`,
  `utils/`, `types/`, `config/`, `stores/`. These names are conventions, not framework rules — be consistent.
- A **feature folder** owns its slice end-to-end: `features/<name>/{components,hooks,api,utils,types}`
  plus an optional `index.ts` public API. Internals stay private to the feature.
- **Type-based** (`components/`, `hooks/`, `utils/` only) is acceptable for small apps; migrate to
  **feature-based** as the count of files-per-folder grows past comfort.
- See **references/folder-structure.md** for full trees and the migration path.

## Where to put things

| Code | Default location | Promote / escalate when |
|------|------------------|--------------------------|
| Component used by one feature | `features/<f>/components/` | a 2nd feature needs it → `components/` |
| Shared UI primitive (Button, Card) | `components/ui/` | — |
| Custom hook (feature-specific) | `features/<f>/hooks/` | reused elsewhere → `hooks/` |
| Business logic | a custom hook, or `features/<f>/api`/services; server-side → a DAL | — |
| Constant used once | top of the file that uses it | feature-wide → `<f>/constants.ts`; app-wide → `config/` |
| Pure, generic helper | `utils/` | — |
| Project-specific helper | beside its feature (`<f>/utils` or `*.helpers.ts`) | becomes generic → `utils/` |
| Type used once | same file as its use | shared → `<f>/types.ts` or `*.types.ts`; cross-package → shared package |
| API / data-fetch functions | `features/<f>/api/` or `lib/api` | — |
| Server Action (Next.js) | `<f>/actions.ts` / `_actions/`, thin → delegates to DAL | — |
| Third-party client/init (db, auth, SDK) | `lib/` | — |

Definitions and the reasoning (utils vs helpers vs lib vs services, type placement, business-logic
placement) are in **references/where-things-go.md**.

## Module boundaries & imports

- **Each feature exposes a public API.** Import a feature through its entry point, not its deep
  internals. This keeps features swappable and prevents tangled coupling.
- **Enforce the dependency direction with tooling** (ESLint `import/no-restricted-paths`): shared may
  not import from features; features may not import from each other; routing/`app` sits on top.
- **Use path aliases** (`@/*`) instead of `../../../` relative chains.
- **Barrel files (`index.ts`):** a thin, per-feature public-API barrel is fine. Avoid large or
  app-wide barrels and deep barrel chains — they hurt tree-shaking and dev-server/HMR and create
  import cycles. Prefer direct imports for internal and shared modules.

## Component decomposition (structural)

When and whether to split — not how to write the component (that's react-best-practices).

- **Split on a concrete reason:** reuse, a distinct responsibility, independently-changing state,
  testability, or readability. Don't split on line count alone.
- A single-responsibility component can be large and fine; a component doing **several** things
  should be split regardless of size.
- **Prefer composition.** Pass `children`/slots; "lift content up" (give a wrapper its content via
  `children` when it doesn't use it for logic); "push state down" to the component that needs it.
- Reach for **context only after** extracting components and passing `children` fails to remove the
  prop drilling.
- Use **compound components** for groups of related parts that share implicit state.
- **Don't apply container/presentational as a rule** — it's superseded; extract logic into hooks instead.
- **Avoid premature abstraction (AHA):** tolerate duplication until the right abstraction is obvious;
  an abstraction with a single consumer is premature.

## State & data placement

Where state lives (organizational). For state-hook coding rules, see react-best-practices.

- Keep state **as local as possible**; lift only to the closest common parent that actually needs it.
- **Server/remote data is server state** — manage it with TanStack Query (or the framework data
  layer), not `useState`/`useEffect`. Keep it out of UI-state stores.
- **Business logic belongs in hooks/services**, not component bodies.
- **Context is dependency injection** (theme, auth, i18n), not a general store; split contexts by concern.
- **URL-owned state** (filters, pagination, search) belongs in the URL, not component state.

## Next.js App Router organization

Key rules (full detail in **references/nextjs-app-router.md**):

- **`app/` is for routing only** — push logic into `features/`.
- **Colocate** non-route files inside `app/` (only `page`/`route` output ships); opt subtrees out of
  routing with **private folders** (`_folder`); organize routes without changing URLs via **route
  groups** (`(group)`).
- **Push `"use client"` to the leaves** of the tree; pass Server Components into Client Components as
  `children`/props rather than importing them.
- **Isolate server-only code** (the `server-only` package, a data-access layer); `process.env` and
  secrets stay server-side.
- **Keep Server Actions thin** (a `<feature>/actions.ts`) and delegate to a server-only data layer.
- **`lib` vs `utils` convention:** `lib/` = stateful integrations (db, auth, SDK clients), `utils/` =
  pure helpers. (Officially both names are arbitrary — pick one convention and hold it.)

## Naming conventions

- Files/folders: **kebab-case** (or match the project's existing convention — consistency first).
- Components & component files: **PascalCase**. Hooks: **useXxx**. Functions/vars: **camelCase**.
  Constants: **UPPER_SNAKE_CASE**. Types/interfaces: **PascalCase**.
- Bundle files are plural: `constants.ts`, `types.ts`, `hooks.ts`. Suffix shared kinds:
  `*.types.ts`, `*.helpers.ts`, `*.store.ts`.
- Booleans: `is`/`has`/`should`. Event handlers: `handle*` (defining) / `on*` (prop). Utilities:
  `get`/`set`/`use`. HOCs: `with*`.

## Architecture smells (flag these in review)

- **Junk-drawer** `utils.ts` / `helpers.ts` / `misc.ts` collecting unrelated functions — name files
  by what they *provide*; group by cohesion.
- **Deep prop drilling** a `children`/composition extraction would remove.
- **Premature `shared/`** abstraction with a single consumer.
- **Large/app-wide barrel files** and **import cycles**.
- **Business logic or data fetching in component bodies** instead of hooks/services.
- **Cross-feature deep imports** (reaching into another feature's internals).
- **Server-only code imported into client modules**, or secrets reaching the client bundle.
- **Mixed conventions** — type-based and feature-based applied inconsistently in the same codebase.
