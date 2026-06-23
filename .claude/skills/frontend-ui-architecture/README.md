# frontend-ui-architecture — skill README

> Human-facing documentation for the `frontend-ui-architecture` skill.
> The operational instructions Claude loads live in [SKILL.md](SKILL.md); deep reference material is
> under [references/](references/). This README captures the skill's purpose, scope, relationships to
> other skills, version, and the sources it was built from.

## Focus

**Frontend UI architecture & code organization for React and Next.js** — the decisions about
**where code lives and how a project is organized**. It answers "where should this go?" questions:
folder/file structure, feature- vs type-based organization, colocation, module boundaries and import
rules, and the Server/Client component boundary as an *organizational* concern.

It deliberately covers **structure and organization only** — not how to write the code inside a file.

## What it covers

- **Folder structure** — the scaling progression (single file → feature folders → packages), the
  feature-folder anatomy, type-based vs feature-based, and full trees for React (Vite) and Next.js.
- **Where things go** — components, custom hooks, business logic, constants, types, and the
  utils / helpers / lib / services distinction, with a promotion rule (local → shared on second use).
- **Module boundaries** — per-feature public APIs, unidirectional dependency flow (shared → features →
  app), no cross-feature imports, path aliases, and barrel-file trade-offs.
- **Component decomposition (structural)** — when/whether to split, composition over configuration,
  compound components, and why container/presentational is superseded.
- **State & data placement** — keep state local, server state vs UI state, context as dependency
  injection, URL-owned state.
- **Next.js App Router organization** — `app/` as routing-only, route groups & private folders,
  pushing `"use client"` to the leaves, Server Actions placement, and the server-only data-access layer.
- **Naming conventions** and an **architecture-smells** checklist for reviews.

## When to use it

- Setting up a new React/Next.js project and choosing its structure.
- Deciding where a specific file/component/hook/constant/type/action should live.
- Resolving "utils vs helpers vs lib vs services" or "feature-based vs type-based" debates.
- Reviewing a codebase's architecture, or refactoring a folder layout that has drifted.
- Deciding how to split a component or where the API/data layer belongs.
- Organizing the Server/Client boundary in an App Router app.

## Related skills (and how this one differs)

This skill is intentionally narrow so it complements rather than duplicates the others:

| Skill | Scope | Boundary vs this skill |
|-------|-------|------------------------|
| **frontend-ui-architecture** (this) | **Where** code lives — structure, file placement, boundaries, organization | — |
| `react-best-practices` | **How** to write React — component/hook/state coding rules, anti-patterns, rendering, memoization, a11y | Use it for in-file correctness; use this skill for project layout & placement. |
| `next-best-practices` | Next.js **API/feature usage** — RSC mechanics, data/async APIs, metadata, error handling, image/font, bundling | Use it for *how Next.js features work*; use this skill for *how to organize a Next.js project*. |
| `typescript-expert` | TypeScript type-level programming, tooling, migrations | Use it for advanced typing; this skill only covers *where types live*. |
| `react-testing-library` | Testing React components/hooks | Orthogonal — testing philosophy & RTL usage. |

Rule of thumb: **this skill decides the folders and boundaries; the others decide the code inside them.**

## Version

**1.1.0** — current (2026-06-19). See changelog below.

Versioning policy (semver):
- **patch** — wording/clarity fixes, link updates, no guidance change.
- **minor** — new rules, new reference files, or expanded coverage that's backward-compatible.
- **major** — a change in recommended structure/conventions that would contradict prior guidance.

The version is also recorded in the `version:` field of [SKILL.md](SKILL.md) frontmatter.

### Changelog

- **1.1.0** (2026-06-19) — Added an "Opinionated defaults" section that front-loads the non-obvious, commit-to-an-answer calls (feature-first layout, the public-API/no-cross-feature-imports boundary, lib-vs-utils, the DAL + secrets boundary, Server/Client + a `Providers` wrapper, promote-on-second-use). Iterated via the skill-creator eval loop.
- **1.0.0** (2026-06-19) — Initial skill: `SKILL.md` + `references/folder-structure.md`,
  `references/where-things-go.md`, `references/nextjs-app-router.md`. Built from the verified source
  list below.

---

## Sources

Every source below was opened and verified (resolves + on-topic) during research in June 2026.
Legend: ⭐ anchor/most authoritative · ⚠️ outdated/version-specific or contested · 🔁 opinion, not consensus.

### Anchor references (comprehensive)

- ⭐ React — Learn / Quick Start — react.dev — https://react.dev/learn
- ⭐ React — Describing the UI — react.dev — https://react.dev/learn/describing-the-ui
- The Rules of React — react.dev — https://react.dev/reference/rules
- React API Reference Overview — react.dev — https://react.dev/reference/react
- ⭐ Bulletproof React — alan2207 — https://github.com/alan2207/bulletproof-react
- Bulletproof React — docs folder — https://github.com/alan2207/bulletproof-react/tree/master/docs
- ⭐ React Folder Structure Best Practices [2026] — Robin Wieruch — https://www.robinwieruch.de/react-folder-structure/
- ⭐ Patterns.dev — Lydia Hallie & Addy Osmani — https://www.patterns.dev/
- Airbnb React/JSX Style Guide — https://github.com/airbnb/javascript/tree/master/react
- React TypeScript Cheatsheet — https://github.com/typescript-cheatsheets/react
- ⭐ TkDodo's Blog — Dominik Dorfmeister — https://tkdodo.eu/blog/
- ⭐ The Kent C. Dodds Blog — https://kentcdodds.com/blog

### Project structure / where components live

- ⭐ React Folder Structure Best Practices [2026] — Robin Wieruch — https://www.robinwieruch.de/react-folder-structure/
- Feature-based React Architecture — Robin Wieruch — https://www.robinwieruch.de/react-feature-architecture/
- Folder Structures in React Projects — Will T. (itswillt), DEV — https://dev.to/itswillt/folder-structures-in-react-projects-3dp8
- How To Structure React Projects From Beginner To Advanced — Web Dev Simplified — https://blog.webdevsimplified.com/2022-07/react-folder-structure/
- 🔁 How to structure your React projects — Sandro Roth — https://sandroroth.com/blog/project-structure/
- ⭐ Colocation — Kent C. Dodds — https://kentcdodds.com/blog/colocation
- State Colocation will make your React app faster — Kent C. Dodds — https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster
- ⭐ Bulletproof React — Project Structure — https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md
- Bulletproof React — Project Standards — https://github.com/alan2207/bulletproof-react/blob/master/docs/project-standards.md
- Project structure and organization — Next.js — https://nextjs.org/docs/app/getting-started/project-structure
- ⭐ How we optimized package imports in Next.js (barrel files) — Shu Ding, Vercel — https://vercel.com/blog/how-we-optimized-package-imports-in-next-js
- 🔁 Burn the Barrel! — Brett Uglow — https://uglow.medium.com/burn-the-barrel-c282578f21b6
- Naming Conventions in React for Clean & Scalable Code — Sufle.io — https://www.sufle.io/blog/naming-conventions-in-react

### Component decomposition

- ⭐ Thinking in React — react.dev — https://react.dev/learn/thinking-in-react
- Your First Component — react.dev — https://react.dev/learn/your-first-component
- Techniques for decomposing React components — David Tang — https://medium.com/dailyjs/techniques-for-decomposing-react-components-e8a1081ef5da
- When to break up a component into multiple components — Kent C. Dodds — https://kentcdodds.com/blog/when-to-break-up-a-component-into-multiple-components
- 🔁 I write big React components — Kirill Kurko — https://kkurko.dev/blog/i-write-big-react-components
- Passing Props to a Component — react.dev — https://react.dev/learn/passing-props-to-a-component
- ⭐ Passing Data Deeply with Context — react.dev — https://react.dev/learn/passing-data-deeply-with-context
- Advanced Guide on React Component Composition — Makers' Den — https://makersden.io/blog/guide-on-react-component-composition
- ⭐ Component Composition is great btw — TkDodo — https://tkdodo.eu/blog/component-composition-is-great-btw
- React Hooks: Compound Components — Kent C. Dodds — https://kentcdodds.com/blog/compound-components-with-react-hooks
- Compound Pattern — patterns.dev — https://www.patterns.dev/react/compound-pattern/
- Render Props Pattern — patterns.dev — https://www.patterns.dev/react/render-props-pattern/
- ⚠️ Presentational and Container Components — Dan Abramov (read the 2019 disclaimer) — https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0
- ⭐ AHA Programming (Avoid Hasty Abstractions) — Kent C. Dodds — https://kentcdodds.com/blog/aha-programming
- Writing Resilient Components — Dan Abramov, Overreacted — https://overreacted.io/writing-resilient-components/

### Constants, utils vs helpers, types

- ⭐ React Folder Structure Best Practices [2026] — Robin Wieruch — https://www.robinwieruch.de/react-folder-structure/
- ⭐ Bulletproof React — Project Structure — https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md
- Delightful React File/Directory Structure — Josh W. Comeau — https://www.joshwcomeau.com/react/file-structure/
- 🔁 Project Standards — React Handbook, Eric Diviney — https://reacthandbook.dev/project-standards
- 🔁 Lib vs Utils vs Services Folders — indie-starter.dev — https://indie-starter.dev/blog/lib-vs-utils-vs-services-folders-simple-explanation-for-developers
- 🔁 Helpers and utils folders in software architecture (why avoid them) — dev.to/knzt — https://dev.to/knzt/helpers-and-utils-folders-in-software-architecture-3f8h
- 🔁 Utils files are not so useful and helper classes are not so helpful! — dev.to/dvddpl — https://dev.to/dvddpl/utils-files-are-not-so-useful-and-helper-classes-are-not-so-helpful-1kfn
- ⭐ Colocation — Kent C. Dodds — https://kentcdodds.com/blog/colocation
- ⭐ Where To Put Your Types in Application Code — Matt Pocock — https://www.totaltypescript.com/where-to-put-your-types-in-application-code
- 🔁 The Difference Between TypeScript Unions, Enums, and Objects — Cam McHenry — https://camchenry.com/blog/typescript-union-vs-enum-vs-object
- What Are Magic Numbers And Why Are They Bad — Web Dev Simplified — https://blog.webdevsimplified.com/2020-02/magic-numbers/
- `no-magic-numbers` rule — ESLint — https://eslint.org/docs/latest/rules/no-magic-numbers

### Business logic placement

- ⭐ Reusing Logic with Custom Hooks — react.dev — https://react.dev/learn/reusing-logic-with-custom-hooks
- ⭐ You Might Not Need an Effect — react.dev — https://react.dev/learn/you-might-not-need-an-effect
- ⭐ React Query as a State Manager — TkDodo — https://tkdodo.eu/blog/react-query-as-a-state-manager
- Practical React Query — TkDodo — https://tkdodo.eu/blog/practical-react-query
- Effective React Query Keys — TkDodo — https://tkdodo.eu/blog/effective-react-query-keys
- Deriving Client State from Server State — TkDodo — https://tkdodo.eu/blog/deriving-client-state-from-server-state
- Queries (useQuery guide) — TanStack Query — https://tanstack.com/query/latest/docs/framework/react/guides/queries
- Important Defaults — TanStack Query — https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults
- ⭐ Managing State — react.dev — https://react.dev/learn/managing-state
- Scaling Up with Reducer and Context — react.dev — https://react.dev/learn/scaling-up-with-reducer-and-context
- ⭐ Application State Management with React — Kent C. Dodds — https://kentcdodds.com/blog/application-state-management-with-react
- How to useContext in React — Robin Wieruch — https://www.robinwieruch.de/react-usecontext-hook/
- Container/Presentational Pattern — patterns.dev — https://www.patterns.dev/react/presentational-container-pattern/
- Hooks Pattern — patterns.dev — https://www.patterns.dev/react/hooks-pattern/
- Separate API Layers In React Apps — 6 Steps — Johannes Kettmann — https://dev.to/jkettmann/separate-api-layers-in-react-apps-6-steps-towards-maintainable-code-4n2
- How to fetch data with React Hooks — Robin Wieruch — https://www.robinwieruch.de/react-hooks-fetch-data/

### Next.js (App Router) — structure & organization

- ⭐ Project structure and organization — Next.js Docs — https://nextjs.org/docs/app/getting-started/project-structure
- ⭐ Layouts and Pages — Next.js Docs — https://nextjs.org/docs/app/getting-started/layouts-and-pages
- layout.js (file convention) — Next.js Docs — https://nextjs.org/docs/app/api-reference/file-conventions/layout
- route.js (file convention) — Next.js Docs — https://nextjs.org/docs/app/api-reference/file-conventions/route
- Route Groups `(group)` — Next.js Docs — https://nextjs.org/docs/app/api-reference/file-conventions/route-groups
- src Folder — Next.js Docs — https://nextjs.org/docs/app/api-reference/file-conventions/src-folder
- ⚠️ Absolute Imports and Module Path Aliases (v14 archive) — Next.js Docs — https://nextjs.org/docs/14/app/building-your-application/configuring/absolute-imports-and-module-aliases
- Parallel Routes `@slot` — Next.js Docs — https://nextjs.org/docs/app/api-reference/file-conventions/parallel-routes
- Intercepting Routes `(.)` — Next.js Docs — https://nextjs.org/docs/app/api-reference/file-conventions/intercepting-routes
- ⭐ Bulletproof React — Project Structure — https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md
- React Folder Structure Best Practices [2026] — Robin Wieruch — https://www.robinwieruch.de/react-folder-structure/
- The Definitive Guide to Next.js App Router Project Structure — Makerkit — https://makerkit.dev/blog/tutorials/nextjs-app-router-project-structure
- How to Build Reusable Architecture for Large Next.js Applications — freeCodeCamp — https://www.freecodecamp.org/news/reusable-architecture-for-large-nextjs-applications/
- 🔁 The Ultimate Guide to Organizing Your Next.js 15 Project Structure — Wisp CMS — https://www.wisp.blog/blog/the-ultimate-guide-to-organizing-your-nextjs-15-project-structure
- How to structure a scalable Next.js project architecture — LogRocket — https://blog.logrocket.com/structure-scalable-next-js-project-architecture/
- Barrel imports (index.ts re-exports) in Next.js — vercel/next.js Discussion #92926 — https://github.com/vercel/next.js/discussions/92926
- 🔁 Feature-Sliced Design — Usage with Next.js — https://feature-sliced.design/docs/guides/tech/with-nextjs
- 🔁 The Ultimate Next.js App Router Architecture — FSD blog — https://feature-sliced.design/blog/nextjs-app-router-guide

### Server vs Client Components — organizing the boundary

- ⭐ Server and Client Components — Next.js Docs — https://nextjs.org/docs/app/getting-started/server-and-client-components
- `use client` directive — Next.js Docs — https://nextjs.org/docs/app/api-reference/directives/use-client
- `'use client'` directive — React Docs — https://react.dev/reference/rsc/use-client
- `'use server'` directive — React Docs — https://react.dev/reference/rsc/use-server
- Server Components — React Docs — https://react.dev/reference/rsc/server-components
- ⚠️ Server and Client Composition Patterns (v14 archive) — Next.js Docs — https://nextjs.org/docs/14/app/building-your-application/rendering/composition-patterns
- Server-only Code in the Next.js App Router — Builder.io — https://www.builder.io/blog/server-only-next-app-router
- ⭐ How to think about data security in Next.js — Next.js Docs — https://nextjs.org/docs/app/guides/data-security
- ⚠️ How to Think About Security in Next.js — Sebastian Markbåge, Next.js Blog — https://nextjs.org/blog/security-nextjs-server-components-actions
- ⭐ Making Sense of React Server Components — Josh W. Comeau — https://www.joshwcomeau.com/react/server-components/

> The full annotated version of this list (with per-source notes, dates, and verification flags) is
> kept in `react-best-practices-sources.md` at the repository root.
