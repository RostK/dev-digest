# React / Frontend Best Practices — sources for the skill

Collected and verified: June 2026. Every URL was opened and confirmed (resolves + on-topic).
This is a raw, topic-grouped source list for the upcoming "React/frontend best practices" skill.

**Legend:**
- ⭐ — anchor / most authoritative source (read first)
- ⚠️ — outdated/version-specific or contested (include only with context)
- 🔁 — opinion, not consensus

---

## 0. Anchor sources (comprehensive references — read these first)

- ⭐ **React — Learn / Quick Start** — react.dev (React core team)
  https://react.dev/learn
  The official hub, ~80% of day-to-day React concepts. Primary source, interactive examples.

- ⭐ **React — Describing the UI** — react.dev
  https://react.dev/learn/describing-the-ui
  Component-design chapter: your first component, import/export, JSX, props, conditional rendering, lists, keeping components pure, "UI as a tree".

- **The Rules of React** — react.dev
  https://react.dev/reference/rules
  The hard rules: components/hooks must be pure, Rules of Hooks. "What you must not do."

- **React API Reference Overview** — react.dev
  https://react.dev/reference/react
  Map of every built-in API (hooks, components, directives, React Compiler).

- ⭐ **Bulletproof React** — alan2207 (Alan Alickovic), ~35.4k★, actively maintained
  https://github.com/alan2207/bulletproof-react
  The most-cited opinionated architecture for production React: feature folders, unidirectional dependency flow, clean boundaries. Not boilerplate — a principles guide.

- **Bulletproof React — docs folder**
  https://github.com/alan2207/bulletproof-react/tree/master/docs
  Deep docs: project-structure, project-standards, components-and-styling, api-layer, state-management, testing, error-handling, security, performance, deployment.

- ⭐ **React Folder Structure Best Practices [2026]** — Robin Wieruch (updated 2026-05-05)
  https://www.robinwieruch.de/react-folder-structure/
  The canonical progressive guide: single file → feature/domain folders → monorepo. Updated yearly. **Referenced in almost every topic below.**

- ⭐ **Patterns.dev** — Lydia Hallie & Addy Osmani (Google Chrome)
  https://www.patterns.dev/
  Free reference: design patterns (HOC, render props, hooks, compound, container/presentational), rendering patterns (CSR/SSR/SSG/RSC), performance.

- **Airbnb React/JSX Style Guide** — Airbnb
  https://github.com/airbnb/javascript/tree/master/react
  The most popular community style guide: component structure, naming, JSX formatting, props (keys, a11y), method ordering, anti-patterns.

- **React TypeScript Cheatsheet** — typescript-cheatsheets org, ~47.1k★, current for React 19
  https://github.com/typescript-cheatsheets/react
  The canon of typing React: components, all hooks, props/generics, context, refs (incl. React 19 ref-as-prop), events/forms.

- ⭐ **TkDodo's Blog** — Dominik Dorfmeister (TanStack Query/Router maintainer)
  https://tkdodo.eu/blog/
  Deep essays on React + TS, data fetching, state management, codebase architecture. The top authority on server-state.

- ⭐ **The Kent C. Dodds Blog** — Kent C. Dodds (creator of Testing Library, Epic React)
  https://kentcdodds.com/blog
  200+ articles: patterns, hooks, testing, application architecture.

---

## 1. Project structure / where components live

### Feature-based vs type-based

- ⭐ **React Folder Structure Best Practices [2026]** — Robin Wieruch (updated 2026-05-05)
  https://www.robinwieruch.de/react-folder-structure/
  Step by step: single file → files → component folders → technical folders (hooks/context/utils) → feature folders → domain/package/app.

- **Feature-based React Architecture** — Robin Wieruch (2024-11-25)
  https://www.robinwieruch.de/react-feature-architecture/
  Why feature/domain folders; how to decouple components + data fetching on a posts/comments example. Caveat about N+1 queries.

- **Folder Structures in React Projects** — Will T. (itswillt), DEV (2024-03-20)
  https://dev.to/itswillt/folder-structures-in-react-projects-3dp8
  Taxonomy: file-type grouping → hybrid → module/feature-based + a glossary of folders (components, hooks, services, utils, lib, types).

- **How To Structure React Projects From Beginner To Advanced** — Web Dev Simplified (Kyle Cook, 2022-07-11)
  https://blog.webdevsimplified.com/2022-07/react-folder-structure/
  Progression simple → `pages` → `features` with index.js as a public API. A bit older (pre–App Router).

- 🔁 **How to structure your React projects** — Sandro Roth (2023-02-16)
  https://sandroroth.com/blog/project-structure/
  Compares type-based, bulletproof-react, and Feature-Sliced Design (FSD); advocates FSD. FSD is one (contested) opinion, not consensus.

### Colocation (keep files near where they're used)

- ⭐ **Colocation** — Kent C. Dodds (2019-06-17, evergreen)
  https://kentcdodds.com/blog/colocation
  The canonical principle "place code as close to where it's relevant as possible" — comments, styles, tests, state, utilities.

- **State Colocation will make your React app faster** — Kent C. Dodds (2019-09-23)
  https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster
  Performance argument: push state down, closer to use → fewer unnecessary re-renders. A decision tree for state placement.

### Opinionated architecture for growing apps

- ⭐ **Bulletproof React — Project Structure**
  https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md
  Most code in `features/`, shared top-level folders (`app`, `components`, `hooks`, `lib`, `types`, `utils`), unidirectional import rule (shared → features → app), enforced via ESLint. **This version advises against barrel files.**

- **Bulletproof React — Project Standards**
  https://github.com/alan2207/bulletproof-react/blob/master/docs/project-standards.md
  ESLint/Prettier, TypeScript, Husky, absolute imports via `@/*`, kebab-case naming enforced by lint.

### src/ layout and framework conventions

- **Project structure and organization** — Next.js (Vercel, v16, updated 2025-12-09)
  https://nextjs.org/docs/app/getting-started/project-structure
  App Router: top-level folders (`app`, `public`, optional `src`), routing conventions, colocation by default, private folders (`_folder`), route groups (`(group)`), aliases.

### Barrel files (index.ts) — pros and cons

- ⭐ **How we optimized package imports in Next.js** — Shu Ding, Vercel Eng (2023-10-13)
  https://vercel.com/blog/how-we-optimized-package-imports-in-next-js
  Why large barrel files hurt build/runtime (200–800ms import cost), the limits of tree-shaking, how `optimizePackageImports` fixes it. *Applies to external packages, not your own barrels.*

- 🔁 **Burn the Barrel!** — Brett Uglow, Medium (2023-03-06)
  https://uglow.medium.com/burn-the-barrel-c282578f21b6
  Case against barrel files: slower Jest, ~5–10% smaller Next.js pages, ~25% faster CI after removal. One-sided (anti-barrel) — balance with a pro-barrel view.

### Naming conventions

- **Naming Conventions in React for Clean & Scalable Code** — Barış Emren, Sufle.io (2024-09-10)
  https://www.sufle.io/blog/naming-conventions-in-react
  kebab-case files, PascalCase components/types, camelCase functions, UPPER_SNAKE_CASE constants + prefixes (`is/has/should`, `handle/on`, `get/set/use`, `with`).

---

## 2. Component decomposition / how to split

### "Thinking in React" / breaking down the UI

- ⭐ **Thinking in React** — react.dev
  https://react.dev/learn/thinking-in-react
  The canonical 5-step methodology: component hierarchy → static version → minimal state → where state lives → inverse data flow. SRP for component boundaries.

- **Your First Component** — react.dev
  https://react.dev/learn/your-first-component
  Components as reusable building blocks ("define once, use anywhere"). The basis for "reusable vs one-off".

- **Techniques for decomposing React components** — David Tang, DailyJS/Medium
  https://medium.com/dailyjs/techniques-for-decomposing-react-components-e8a1081ef5da
  A practical catalog of decomposition techniques. Older — verify the code style, but the reasoning is timeless.

### Component size / when "too big"

- **When to break up a component into multiple components** — Kent C. Dodds (2019-07-19)
  https://kentcdodds.com/blog/when-to-break-up-a-component-into-multiple-components
  Split only when there's a concrete problem (performance, reuse, state confusion, tests) — "NOT BEFORE." Quotes Sandi Metz: "duplication is far cheaper than the wrong abstraction."

- 🔁 **I write big React components** — Kirill Kurko
  https://kkurko.dev/blog/i-write-big-react-components
  Counterpoint: the metric is *responsibilities*, not lines. An SRP component can be large and fine. A counterweight to the "small components" dogma.

### Composition over configuration; children & slots

- **Passing Props to a Component** — react.dev
  https://react.dev/learn/passing-props-to-a-component
  Props design: destructuring, defaults, spread (carefully), props as immutable snapshot, `children` for composition.

- ⭐ **Passing Data Deeply with Context** — react.dev
  https://react.dev/learn/passing-data-deeply-with-context
  Prop drilling vs composition: officially recommends *first* extracting a component and passing JSX as `children`, *before* reaching for context.

- **Advanced Guide on React Component Composition** — Kalle Bertell, Makers' Den (2025-10-04)
  https://makersden.io/blog/guide-on-react-component-composition
  A recent survey of patterns: children, render props, HOC, compound, slot-based + composition-vs-configuration + RSC.

- ⭐ **Component Composition is great btw** — TkDodo (2024-09-21)
  https://tkdodo.eu/blog/component-composition-is-great-btw
  Use composition (layout components + early returns per state) instead of stacking conditional rendering in JSX. "Every if with a return = one state the user can see."

### Compound components

- **React Hooks: Compound Components** — Kent C. Dodds (2019-02-18)
  https://kentcdodds.com/blog/compound-components-with-react-hooks
  The canonical compound-components pattern via Context + hooks (the `<Toggle>` example). API still current.

- **Compound Pattern** — patterns.dev
  https://www.patterns.dev/react/compound-pattern/
  Two implementations (Context API and `React.Children.map`/`cloneElement`), pros/cons, React 18+ guidance.

- **Render Props Pattern** — patterns.dev
  https://www.patterns.dev/react/render-props-pattern/
  Render props for sharing logic; notes that custom hooks are now usually preferred. For understanding the patterns landscape.

### Presentational vs Container (contested/outdated)

- ⚠️ **Presentational and Container Components** — Dan Abramov (2015, updated 2019)
  https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0
  The original of the pattern — **BUT read with the 2019 disclaimer**: Abramov no longer recommends splitting this way, hooks achieve the same. Primary source, but superseded by its author.

### Abstraction / reusable vs one-off

- ⭐ **AHA Programming (Avoid Hasty Abstractions)** — Kent C. Dodds (2020-06-22)
  https://kentcdodds.com/blog/aha-programming
  Avoid premature abstraction, tolerate duplication until the right abstraction "screams at you." DRY vs WET. Directly about reusable vs one-off.

- **Writing Resilient Components** — Dan Abramov, Overreacted (2019-03-16)
  https://overreacted.io/writing-resilient-components/
  4 design principles: don't stop the data flow, always be ready to render, no component is a singleton, keep local state isolated.

---

## 3. Constants, utils vs helpers, types

### Where utils / constants / types / lib / services live

- ⭐ **React Folder Structure Best Practices [2026]** — Robin Wieruch (updated 2026-05-05)
  https://www.robinwieruch.de/react-folder-structure/
  Promoting a util from `features/x/utils/` to a shared root `utils/` when a 2nd feature needs it; grouping utils by category; plural naming of bundle files (`constants.ts`, `types.ts`, `hooks.ts`).

- ⭐ **Bulletproof React — Project Structure**
  https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md
  Shared top-level folders (`utils/`, `types/`, `config/`, `lib/`, `hooks/`, `stores/`) vs per-feature. Advises *against* barrel files.

- **Delightful React File/Directory Structure** — Josh W. Comeau (2022-03-15, updated 2025-12-03)
  https://www.joshwcomeau.com/react/file-structure/
  Distinguishes `helpers` (project-specific, `category.helpers.ts`) from `utils` (generic/portable, `utils.ts`) and `constants.ts`; colocates sub-components/helpers/types/hooks alongside. (Opinionated, uses barrel files.)

- 🔁 **Project Standards** — React Handbook, Eric Diviney (2025)
  https://reacthandbook.dev/project-standards
  Endorses the bulletproof structure + in-component ordering (imports/constants → prop types → state → hooks → helpers → JSX). "Don't spend >5 min planning folders."

### utils vs helpers vs lib vs services (naming and what goes where)

- 🔁 **Lib vs Utils vs Services Folders** — Ali.H, indie-starter.dev (2025-06-02)
  https://indie-starter.dev/blog/lib-vs-utils-vs-services-folders-simple-explanation-for-developers
  Framework: `lib` = polished building blocks; `utils` = small generic helpers (date format, id gen); `services` = business logic / external integrations (API, DB, auth).

### Avoiding the "junk drawer" utils

- 🔁 **Helpers and utils folders in software architecture (why avoid them)** — Hellen (dev.to/knzt, 2025-03-12)
  https://dev.to/knzt/helpers-and-utils-folders-in-software-architecture-3f8h
  Generic helpers/utils folders = a sign of low cohesion. Reframes: not "where to put a generic function," but "why doesn't it fit any module."

- 🔁 **Utils files are not so useful and helper classes are not so helpful!** — Davide de Paolis (dev.to/dvddpl, 2020-03-23)
  https://dev.to/dvddpl/utils-files-are-not-so-useful-and-helper-classes-are-not-so-helpful-1kfn
  How utils files accrete unrelated functions and breed duplicates. Heuristic: "name files after what they *provide*, not what they *contain*."

### Colocation (also applies to non-component files)

- ⭐ **Colocation** — Kent C. Dodds (2019-06-17)
  https://kentcdodds.com/blog/colocation
  The principle that justifies colocating constants/helpers/types beside the code that uses them.

### TypeScript: where types live

- ⭐ **Where To Put Your Types in Application Code** — Matt Pocock, totaltypescript.com
  https://www.totaltypescript.com/where-to-put-your-types-in-application-code
  3 rules: single-use types colocate in the same file; shared → the smallest shared location (`*.types.ts`); cross-package → a shared package.

### TypeScript: enums / const objects / unions for sets of constants

- 🔁 **The Difference Between TypeScript Unions, Enums, and Objects** — Cam McHenry (2022-04-30)
  https://camchenry.com/blog/typescript-union-vs-enum-vs-object
  Unions by default (compile-time); `as const` objects when runtime values are needed; avoid `enum` (bundle bloat, quirks).

### Magic numbers/strings → named constants

- **What Are Magic Numbers And Why Are They Bad** — Web Dev Simplified (2020-02-10)
  https://blog.webdevsimplified.com/2020-02/magic-numbers/
  Progression comments → descriptive function names → named constants (UPPER_SNAKE_CASE).

- **`no-magic-numbers` rule** — ESLint docs
  https://eslint.org/docs/latest/rules/no-magic-numbers
  The authoritative tooling reference for enforcing this automatically.

---

## 4. Business logic: where to put it

### Custom hooks & reusing logic

- ⭐ **Reusing Logic with Custom Hooks** — react.dev
  https://react.dev/learn/reusing-logic-with-custom-hooks
  Extracting stateful logic into `use*` hooks: naming, "hooks share logic not state," when (not) to extract.

- ⭐ **You Might Not Need an Effect** — react.dev
  https://react.dev/learn/you-might-not-need-an-effect
  Where logic lives: compute during render, cache with `useMemo`, user logic in event handlers, Effects only for syncing with external systems.

### Data fetching & server state vs UI (TanStack Query)

- ⭐ **React Query as a State Manager** — TkDodo (2021-08-20)
  https://tkdodo.eu/blog/react-query-as-a-state-manager
  React Query = an async state manager, not a fetching library. The foundation for "don't put server state in useState."

- **Practical React Query** — TkDodo (2020-11-16, updated 2023-10-21)
  https://tkdodo.eu/blog/practical-react-query
  Defaults (`staleTime` vs `gcTime`) + the case for wrapping queries in dedicated custom hooks (separating fetching from UI).

- **Effective React Query Keys** — TkDodo (2021-06-13, updated 2022-04-23)
  https://tkdodo.eu/blog/effective-react-query-keys
  Colocating query keys in feature folders, hierarchical array keys, query-key factories.

- **Deriving Client State from Server State** — TkDodo (2025-09-01)
  https://tkdodo.eu/blog/deriving-client-state-from-server-state
  Derive client selections from server data instead of syncing via `useEffect`.

- **Queries (useQuery guide)** — TanStack Query docs (v5/latest)
  https://tanstack.com/query/latest/docs/framework/react/guides/queries
  Official: query keys, query functions, `status` vs `fetchStatus`.

- **Important Defaults** — TanStack Query docs (v5/latest)
  https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults
  Official explanation of caching/staleness/refetch/retry defaults.

### State placement (local vs lifted vs context vs store)

- ⭐ **Managing State** — react.dev
  https://react.dev/learn/managing-state
  Choosing state structure (avoid redundant state), lifting up, preserve/reset via `key`, reducer, context.

- **Scaling Up with Reducer and Context** — react.dev
  https://react.dev/learn/scaling-up-with-reducer-and-context
  `useReducer` + Context (separate state/dispatch contexts, a Provider component, exported `useTasks()`/`useTasksDispatch()`) — a lightweight store from primitives.

- ⭐ **Application State Management with React** — Kent C. Dodds (2020-07-21)
  https://kentcdodds.com/blog/application-state-management-with-react
  Keep state as local as possible, lift only when needed, context sparingly, *server cache* (react-query) separate from UI state. Most apps need no external state library.

- **How to useContext in React** — Robin Wieruch (2021-06-27)
  https://www.robinwieruch.de/react-usecontext-hook/
  Consuming context + encapsulating shared state behind a custom Provider + custom context hook.

### Presentation vs logic (component design)

- **Container/Presentational Pattern** — patterns.dev
  https://www.patterns.dev/react/presentational-container-pattern/
  Separating "how it looks" from "what's fetched/managed" + a modern note: custom hooks replaced class-based containers in React 18+.

- **Hooks Pattern** — patterns.dev
  https://www.patterns.dev/react/hooks-pattern/
  Hooks as the mechanism that replaced HOC, render props, mixins, and container/presentational for sharing stateful logic.

### Service / API layer

- **Separate API Layers In React Apps — 6 Steps** — Johannes Kettmann (2022-10-21)
  https://dev.to/jkettmann/separate-api-layers-in-react-apps-6-steps-towards-maintainable-code-4n2
  Refactor from API-in-components to an `api/` layer (shared Axios instance, interceptors, fetch functions) wrapped in custom hooks. The UI never knows the transport.

- **How to fetch data with React Hooks** — Robin Wieruch (updated 2024-10-21)
  https://www.robinwieruch.de/react-hooks-fetch-data/
  From `useState`/`useEffect` to a reusable generic `useQuery`-style hook (cleanup, race conditions). The "why" behind extracting fetching logic.

---

## Shared takeaways (consensus across nearly all sources)

1. **Start simple**, migrate to feature/domain folders as the app grows.
2. **Colocate aggressively** — keep code near its use; promote to shared only when a 2nd place truly needs it.
3. **A small set of shared top-level folders** (`components`, `hooks`, `lib`, `utils`, `types`, `config`).
4. **Unidirectional dependency flow** (shared → features → app), ideally enforced via ESLint.
5. **Avoid premature abstractions** (AHA) — duplication is cheaper than the wrong abstraction.
6. **Server state ≠ UI state** — for server data use TanStack Query, not `useState`/`useEffect`.
7. **Business logic → custom hooks / a service layer**, keep components "dumb."
8. **Consistency matters more** than any single "correct" layout.

## Flags (include with context)

- ⚠️ Container/Presentational — outdated, only with Abramov's 2019 disclaimer.
- 🔁 FSD (Sandro Roth), anti-barrel (Burn the Barrel), utils-haters (knzt, dvddpl) — opinions, not consensus; present as one side.
- Kent C. Dodds 2019–2020 posts — conceptually timeless, but verify tooling specifics against current.

## Could not verify (worth a manual check)

- **profy.dev** (Screaming Architecture / clean-architecture series) — well cited, but the server refused connections from this environment. Verify manually.

---
---

# Next.js (App Router) — structure & code organization

> Scope: **structure & code organization ONLY** (App Router, Next.js 14/15/16).
> Performance, caching, rendering strategies, and SEO are intentionally NOT included.
> Official-doc versions checked against v16.2.9 (mid-2026). ⚠️ = outdated/version-specific, 🔁 = opinion not consensus.

## 5. App Router: directory structure & file conventions (official — read first)

- ⭐ **Project structure and organization** — Next.js Docs (Vercel, updated 2025-12-09, v16.2.9)
  https://nextjs.org/docs/app/getting-started/project-structure
  **The main source.** An index of every file/folder convention + 3 official organization strategies: (1) keep `app/` for routing only with shared root folders, (2) shared folders inside `app/`, (3) split by feature/route. Explicitly states Next is "unopinionated" and `components`/`lib` are just placeholder names with no framework meaning. Covers route groups `(group)`, private folders `_folder`, `src/`, colocation.

- ⭐ **Layouts and Pages** — Next.js Docs (updated 2026-03-20)
  https://nextjs.org/docs/app/getting-started/layouts-and-pages
  How **folders define URL segments** and **files (`page`, `layout`) create UI**; nested routes, nested layouts via `children`, dynamic segments `[slug]`, the `@/lib`, `@/ui` import convention. Best at explaining *why* the folder tree maps to the URL tree.

- **layout.js (file convention)** — Next.js Docs (updated 2026-03-05)
  https://nextjs.org/docs/app/api-reference/file-conventions/layout
  What `layout.tsx` is for organizationally: shared UI wrapper, the required root layout (`<html>`/`<body>`), nested layouts, multiple root layouts (via route groups).

- **route.js (file convention)** — Next.js Docs (updated 2026-03-03)
  https://nextjs.org/docs/app/api-reference/file-conventions/route
  Where API endpoints (Route Handlers) live in `app/`; key organizational rule: `route.js` and `page.js` cannot coexist in the same segment.

- **Route Groups `(group)`** — Next.js Docs (updated 2025-06-16)
  https://nextjs.org/docs/app/api-reference/file-conventions/route-groups
  Organize routes by section/team/feature **without changing the URL**; multiple root layouts; selectively opt into a shared layout. + caveats (path conflicts, full reload across root layouts).

- **src Folder** — Next.js Docs (updated 2025-10-17)
  https://nextjs.org/docs/app/api-reference/file-conventions/src-folder
  Optional `src/`: move `app` → `src/app` to separate app code from root config. What must stay in root (`public`, `package.json`, `next.config.js`, `.env.*`) + the `@/*` tsconfig adjustment.

- ⚠️ **Absolute Imports and Module Path Aliases** — Next.js Docs (v14 archive)
  https://nextjs.org/docs/14/app/building-your-application/configuring/absolute-imports-and-module-aliases
  Setting up `baseUrl` + `paths` for `@/components/*` instead of `../../../`. ⚠️ Page from the archived v14 branch (folded into other refs in v15/16), but the `@/*` mechanism is unchanged and current.

- **Parallel Routes `@slot`** — Next.js Docs (updated 2026-03-03)
  https://nextjs.org/docs/app/api-reference/file-conventions/parallel-routes
  Named slots via `@folder` (passed as props to a layout, **not** part of the URL) + `default.js`. For the organizational angle — see the "Slots"/convention sections.

- **Intercepting Routes `(.)`** — Next.js Docs (updated 2025-06-16)
  https://nextjs.org/docs/app/api-reference/file-conventions/intercepting-routes
  Matchers `(.)`, `(..)`, `(...)` — like relative paths but for route segments. With Parallel Routes — the modal pattern.

## 6. Code organization: feature-based & where things go

- ⭐ **Bulletproof React — Project Structure** — alan2207 (also in §1)
  https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md
  The most-cited feature-based reference architecture. `src/` (`app`, `components`, `features`, `hooks`, `lib`, `config`, `stores`, `types`, `utils`), per-feature internal structure, unidirectional imports (shared → features → app), no cross-feature imports (ESLint `import/no-restricted-paths`), direct imports over barrel files. **The repo ships a separate Next.js App Router example** — architecture demonstrated on App Router too.

- **React Folder Structure Best Practices [2026]** — Robin Wieruch (also in §1, updated 2026-05-05)
  https://www.robinwieruch.de/react-folder-structure/
  Progression from a single file to feature/domain/monorepo + a section on Next's `app/` directory. (He has no separate Next-only article — this is the authoritative source on the topic.)

- **The Definitive Guide to Next.js App Router Project Structure** — Makerkit (2024-12-18, tested on Next 16.1 / React 19.2)
  https://makerkit.dev/blog/tutorials/nextjs-app-router-project-structure
  Strong current App Router guide: thin `app/` (route groups `(public)`/`(internal)`, colocated `_components/` and `_lib/` per route), a Server Action + service-layer split ("if a Server Action is >20 lines, extract a service"), Zod-validated config, Turborepo `apps/`+`packages/` for scale.

- **How to Build Reusable Architecture for Large Next.js Applications** — freeCodeCamp, Abisoye Alli-Balogun (2026-04-03)
  https://www.freecodecamp.org/news/reusable-architecture-for-large-nextjs-applications/
  A 6-layer model for App Router: colocation first, then feature folders (`features/auth/{components,hooks,lib,types,index.ts}`), then Turborepo `packages/`. Principle: "a file lives as close as possible to where it's used." (Later layers are about tests/CI; for organization take the first three.)

- 🔁 **The Ultimate Guide to Organizing Your Next.js 15 Project Structure** — Wisp CMS, Raymond Yeh (2025-02-16)
  https://www.wisp.blog/blog/the-ultimate-guide-to-organizing-your-nextjs-15-project-structure
  A useful **type-based counterweight** to feature-based: `src/` with `components/{ui,layout,features}`, the `lib/` (external services + business logic) vs `utils/` (pure functions) distinction, `store/`, `models/`, naming (`auth.store.ts`).

- **How to structure a scalable Next.js project architecture** — LogRocket, Abhinav Anshul (updated 2024-01-30)
  https://blog.logrocket.com/structure-scalable-next-js-project-architecture/
  App Router baseline `src/` (`app/` for routing only; `components/`, `utils/`, `hooks/`), colocated component folders + tooling (ESLint/Prettier/Husky/TS). Entry-level/scaffolding, lighter than bulletproof.

- **Barrel imports (index.ts re-exports) in Next.js** — vercel/next.js GitHub Discussion #92926 (2026)
  https://github.com/vercel/next.js/discussions/92926
  Maintainer-involved discussion of barrel-file trade-offs specifically in Next: tree-shaking and dev-server (HMR) degradation, the limits of `optimizePackageImports` (mostly external packages, not local barrels), `sideEffects`.

### 🔁 Feature-Sliced Design with Next.js (strong opinion — one view, not consensus)

- 🔁 **Usage with Next.js** — Feature-Sliced Design official docs (v2.1)
  https://feature-sliced.design/docs/guides/tech/with-nextjs
  Resolving FSD's conflict with App Router (FSD also has an `app` layer): keep Next's `app/` at the **root** for routing only, FSD layers in `src/`, re-export FSD pages into route files. + `api-routes`, `shared/db`.

- 🔁 **The Ultimate Next.js App Router Architecture** — FSD blog, Evan Carter (2026-01-23)
  https://feature-sliced.design/blog/nextjs-app-router-guide
  Narrative companion: mapping FSD layers (app → pages → widgets → features → entities → shared) onto App Router, public-API (`index.ts`) encapsulation. They advise adopting only for large apps (~20+ features).

## 7. Server vs Client Components: organizing the boundary

- ⭐ **Server and Client Components** — Next.js Docs (updated 2026-05-13)
  https://nextjs.org/docs/app/getting-started/server-and-client-components
  Canon. `"use client"` = a module-graph boundary (all imports + directly rendered components go to the client bundle); example — keep `<Layout>` a Server Component, push only `<Search/>` (a leaf) to the client; interleaving via `children`; context providers; `server-only`/`client-only` packages.

- **`use client` directive** — Next.js API Reference (updated 2025-06-16)
  https://nextjs.org/docs/app/api-reference/directives/use-client
  Directive at the top of the file before imports; add it only to entry-point files rendered directly within Server Components (not every client file).

- **`'use client'` directive** — React Docs (react.dev)
  https://react.dev/reference/rsc/use-client
  Primary source: the directive marks a boundary in the **module dependency tree** (not the render tree); a DeepDive on why a Server Component passed as a child/prop stays a Server Component even when a Client Component renders it.

- **`'use server'` directive** — React Docs (react.dev)
  https://react.dev/reference/rsc/use-server
  The structural basis for organizing Server Actions: inline in a function vs at the top of a file (marks **all exports**); module-level `"use server"` is required to import actions into client code. The basis for the `actions.ts` / dedicated-folder convention.

- **Server Components** — React Docs (react.dev)
  https://react.dev/reference/rsc/server-components
  Official example: a Server Component (async DB fetch) composes a Client Component by passing rendered output as `children`. Only output crosses the boundary, not the component code.

- ⚠️ **Server and Client Composition Patterns** — Next.js Docs (v14 archive, 2024-02-22)
  https://nextjs.org/docs/14/app/building-your-application/rendering/composition-patterns
  ⚠️ Archived v14 (folded into getting-started in v15/16), but the clearest contrast of "Unsupported: importing a Server Component into a Client Component" vs "Supported: passing a Server Component as props/children slot" + "Moving Client Components Down the Tree", wrapping third-party, provider colocation.

- **Server-only Code in the Next.js App Router** — Vishwas Gopinath / Builder.io (2024-04-03)
  https://www.builder.io/blog/server-only-next-app-router
  Move sensitive functions into `server-utils.ts`, why shared modules risk leaking server code into the bundle, how the `server-only` package turns that into a build-time error; + `client-only`.

- ⭐ **How to think about data security in Next.js** — Next.js Docs (updated 2026-05-13)
  https://nextjs.org/docs/app/guides/data-security
  3 ways to organize data fetching (HTTP APIs / DAL / component-level); recommends a **DAL** for new projects: a server-only module, auth+authz, returns minimal DTOs, sole accessor of `process.env`. The "thin `"use server"` action delegates to a server-only DAL" pattern + audit checklist.

- ⚠️ **How to Think About Security in Next.js** — Sebastian Markbåge / Next.js Blog (2023-10-23)
  https://nextjs.org/blog/security-nextjs-server-components-actions
  ⚠️ 2023, Next 14 specifics (taint as experimental), but the author is on the React core team — the **original** articulation of the DAL/DTO pattern, `server-only`, and "every `"use server"` export = a public POST endpoint that must self-validate auth + arguments."

- ⭐ **Making Sense of React Server Components** — Josh W. Comeau (updated 2025-05-09)
  https://www.joshwcomeau.com/react/server-components/
  The best mental-model on-ramp (recently refreshed 2025): "Server Components by default," the `'use client'` boundary at the file/module level, why Client Components can only import Client Components, the structural workaround of extracting state into a small Client wrapper (`ColorProvider`) so the rest of the tree stays server-rendered.

## Next.js — shared takeaways (consensus across nearly all sources)

1. **`app/` is for routing only**; push logic into feature/module folders.
2. **Colocation by default**: non-route files sit safely in `app/` (only `page`/`route` output ships); private folders `_folder` opt a subtree out of routing.
3. **Promote to shared only on reuse**; keep route-specific code beside the route.
4. **Push `"use client"` to the leaves** of the tree; pass Server Components into Client as `children`/props.
5. **Isolate server-only code** (`server-only`, DAL); `process.env` and secrets stay on the server.
6. **Direct imports over barrel files** in App Router.
7. **`lib` vs `utils`** (unofficial but common convention): `lib/` = stateful modules/integrations (auth, db, api clients), `utils/` = pure helpers. Officially both are arbitrary placeholder names.

## Next.js — flags

- ⚠️ Version-specific: archived v14 pages (Composition Patterns, Absolute Imports) — mechanisms current, but verify against v15/16.
- ⚠️ Markbåge's security blog (2023) — the DAL concept is canonical, but verify API statuses against the current data-security guide.
- 🔁 FSD (strict 7-layer hierarchy) — adopt only at scale. Type-based (Wisp) vs feature-based (bulletproof/freeCodeCamp/Makerkit) is a real fork, not consensus.

## Next.js — excluded / failed verification

- Dead v13 colocation URL (404) — don't link; use the Colocation section of the Project-structure page.
- `builder.io/blog/nextjs-state-management` — HTTP 404.
- `leerob.com/stack` — real, but about stack/tooling choices, not directory structure.
