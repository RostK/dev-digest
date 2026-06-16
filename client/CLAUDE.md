# client — `@devdigest/web`

Next.js 15 (App Router) + React 19 + TanStack Query + next-intl + Tailwind v4.
Data comes from the Fastify API over hooks — no server-side fetching.

## Commands

`pnpm dev` (:3000) · `pnpm test` (vitest + jsdom, fetch mocked — no API needed) ·
`pnpm typecheck`.

## Conventions

- **Pages are thin.** `app/**/page.tsx` delegates to a colocated `_components/<Name>/`
  folder = `Name.tsx` + `index.ts` barrel + optional `styles.ts` / `constants.ts` /
  `helpers.ts` + `Name.test.tsx`.
- **Data**: never `fetch` in a component. Use TanStack Query hooks in `lib/hooks/*`
  over `lib/api.ts` (`api.get/post/put/patch/del<T>`). Query keys `["resource", ...ctx]`;
  invalidate on mutation.
- **Styling (gotcha)**: Tailwind is installed but the app styles with **CSS design
  tokens** — `var(--accent)`, `var(--crit)`, … via inline / `styles.ts` `CSSProperties`.
  Don't add Tailwind utility classes.
- **UI**: prefer `@devdigest/ui` primitives/kit (`Button`, `Badge`, `Modal`, `Icon`, …)
  over raw HTML elements.
- **i18n (gotcha)**: no hardcoded user-facing strings — `useTranslations("<ns>")`, with
  text in `messages/<locale>/<ns>.json`.
- Mark `"use client"` on anything using hooks / state / router.
- Import types and contracts from `@devdigest/shared`.

## Read when

- Need the UI route map or which API each screen calls → read `client/README.md`.
