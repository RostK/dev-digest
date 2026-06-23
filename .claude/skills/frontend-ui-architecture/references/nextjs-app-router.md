# Next.js App Router — structure & organization

Organizing an App Router project: routing conventions used for structure, the Server/Client boundary,
Server Actions placement, and the data-access layer. Scope is **organization** — for RSC mechanics,
data APIs, caching, and optimization use the **next-best-practices** skill.

Next.js is officially **unopinionated** about non-routing structure: `components`, `lib`, `features`
are placeholder names with no framework meaning. Pick a convention (see folder-structure.md) and apply
it consistently. The framework only fixes the **routing** files.

## `app/` is for routing only

Treat `app/` as a thin routing layer and push real code into `features/` (or `src/`-level folders):

```text
src/
├── app/                      # ROUTING ONLY
│   ├── (marketing)/          # route group — organizes routes, no URL segment
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── (app)/
│   │   ├── dashboard/
│   │   │   ├── page.tsx       # thin: imports from features/, composes
│   │   │   ├── loading.tsx
│   │   │   ├── error.tsx
│   │   │   └── _components/   # private folder: route-local UI, not a route
│   │   └── layout.tsx
│   └── layout.tsx            # required root layout (<html>/<body>)
├── features/                 # the actual app code (see folder-structure.md)
├── components/ • hooks/ • lib/ • utils/ • types/ • config/
```

### Routing conventions you use for organization

- **File conventions:** `layout.tsx` (shared wrapper, nests via `children`), `page.tsx` (route UI),
  `route.ts` (API endpoint — cannot coexist with `page.tsx` in the same segment), `loading.tsx`,
  `error.tsx`, `not-found.tsx`, `template.tsx`.
- **Route groups `(group)`** — group routes by section/area or apply a shared layout **without**
  adding a URL segment. Enables multiple root layouts.
- **Private folders `_folder`** — opt a subtree **out of routing** so you can colocate route-local
  components/helpers inside `app/` safely.
- **Colocation by default** — non-route files inside `app/` don't become routes; only `page`/`route`
  output ships. So route-local code can live next to the route.
- **`src/` directory** — move `app/` to `src/app` to separate app code from root config. Keep
  `public`, `package.json`, `next.config.js`, `.env.*` at the root; set the `@/*` alias in tsconfig.
- **Parallel `@slot` / intercepting `(.)` routes** — organizational mechanisms (e.g. modals); the
  slot folders are passed as props to a layout and aren't part of the URL.

## The Server/Client boundary (organizational)

- **Server Components by default.** Add `"use client"` only where you need interactivity/browser APIs.
- **Push `"use client"` to the leaves.** Keep layouts and page shells as Server Components; mark only
  the small interactive parts (a search box, a toggle) as Client Components.
- **`"use client"` is a module-graph boundary:** everything a client file imports becomes client code.
  A misplaced directive high in the tree drags the whole subtree to the client.
- **Compose across the boundary with `children`/props.** A Client Component can render a Server
  Component passed to it as `children` — but it **cannot import** a Server Component. Pass server
  output in; don't import it.
- **Providers:** wrap the tree in a small Client `Providers` component (context/theme/query client),
  rendered inside a Server layout, so the rest of the tree stays server-rendered.

## Server-only code & the data-access layer (DAL)

- **Isolate server-only modules** with the `server-only` package so an accidental client import fails
  at build time. Keep the `client-only` counterpart for browser-only modules.
- **Centralize data access in a DAL:** a `server-only` module that is the sole place to read
  `process.env`, perform auth/authz checks, hit the DB/external APIs, and return **minimal DTOs**
  (never raw rows) to the UI.
- **Secrets stay server-side.** `process.env` secrets must never be reachable from a `"use client"`
  module graph.

## Server Actions placement

- Put actions in a dedicated module: `features/<f>/actions.ts` (or an `_actions/` folder), marked with
  module-level `"use server"`.
- **Keep actions thin.** An action validates input + auth, then **delegates to the DAL/service**. A
  common rule of thumb: if an action grows past ~20 lines of real logic, extract a service.
- Treat every `"use server"` export as a public POST endpoint: it must validate its own auth and
  arguments — never assume the caller did.

## `lib` vs `utils` (common, unofficial convention)

- `lib/` — stateful integrations & configured clients: `db`, `auth`, API/SDK clients, analytics.
- `utils/` — pure, generic helpers with no side effects.

Both names are arbitrary as far as Next.js is concerned; the value is consistency across the codebase.

## Flags

- Some authoritative write-ups (Composition Patterns, Absolute Imports) live on **archived v14 docs**
  pages — the mechanisms are current, but verify details against the current v15/16 docs.
- The DAL/DTO pattern's canonical articulation is a 2023 post (Next 14 specifics like `taint` were
  experimental) — verify API statuses against the current data-security guide.
- **Feature-Sliced Design** for Next.js is one opinionated methodology, not consensus — adopt only for
  large apps. Type-based vs feature-based is a real fork; choose one.

Sources for everything above are listed in the skill **README.md** (Sources section).
