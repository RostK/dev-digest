# Where things go — definitions & reasoning

The hard cases: utils vs helpers vs lib vs services, constants, types, and business logic.

## utils vs helpers vs lib vs services

These names are conventions, not laws — but a consistent split prevents the junk-drawer problem.

| Folder | Holds | Examples | Stateful? |
|--------|-------|----------|-----------|
| `utils/` | Pure, generic, app-agnostic functions | `formatDate`, `clamp`, `groupBy`, `slugify` | No |
| `helpers/` or `*.helpers.ts` | Project-specific glue, usually colocated with a feature | `buildInvoiceLabel`, `mapApiUserToView` | No |
| `lib/` | Stateful integrations & configured clients | `apiClient`, `authSdk`, `db`, `analytics` | Yes |
| `services/` | Business logic / external-integration orchestration | `createSubscription`, `syncContacts` | Often |

Decision aids:

- **Pure + generic + reusable anywhere** → `utils/`.
- **Pure but tied to this project's domain** → colocate with the feature (`*.helpers.ts`); promote to
  `utils/` only if it becomes truly generic.
- **Wraps/initializes an external dependency** → `lib/`.
- **Encodes a business operation** (often calls `lib/` + applies rules) → `services/` (or a feature's `api/`).

### Avoid the junk drawer

A growing `utils.ts` / `helpers.ts` / `misc.ts` / `common.ts` of unrelated functions is a smell of
**low cohesion**. Counter it:

- **Name files by what they provide, not what they contain:** `date.ts`, `currency.ts`, `array.ts` —
  not `utils.ts`.
- Before adding to `utils/`, ask: *why doesn't this belong to a feature/module?* If it has a home,
  put it there.
- One overstuffed file → split by topic. Many tiny one-function files → group by cohesive topic.

## Constants

- **Used once** → declare at the top of the file that uses it (above the component/function).
- **Feature-wide** → `features/<f>/constants.ts`.
- **App-wide** → `config/` (env-derived, app settings) or a root `constants.ts`.
- **No magic numbers/strings:** replace unexplained literals with `UPPER_SNAKE_CASE` named constants.
  Consider the ESLint `no-magic-numbers` rule to enforce it.
- **Sets of constants (TypeScript):** prefer a union type or an `as const` object over `enum`
  (`enum` adds bundle weight and runtime quirks). Use `as const` when you need the runtime values.

## Types

- **Used once** → keep in the same file as its use.
- **Shared within a feature** → `features/<f>/types.ts`.
- **Shared across features** → the smallest shared location: a top-level `types/` or a `*.types.ts`
  near the shared owner.
- **Shared across packages** → a dedicated shared package (single source of truth; both sides import it).
- Move a type to a broader location only when a second place needs it — same promotion rule as everything else.

## Business logic — where it belongs

Keep it out of component bodies. In order of preference for the *kind* of logic:

- **UI/interaction logic that uses React state** → a **custom hook** (`useCheckout`, `useInvoiceForm`).
  The component renders; the hook decides.
- **Data fetching / mutations** → a **data/API layer** (`features/<f>/api/`, or `lib/api`), consumed
  through a hook (e.g. a TanStack Query hook). Components never call `fetch`/axios directly.
- **Pure domain rules / calculations** → plain functions in `services/` or the feature, unit-testable
  without React.
- **Server-side data access (Next.js / SSR)** → a **data-access layer (DAL)**: a `server-only` module
  that owns auth checks, DB/API access, and `process.env`, returning minimal DTOs. See
  **nextjs-app-router.md**.

The component's job is to render and wire events — not to hold business rules, transport details, or
data-fetching.

## Quick promotion rule (applies to all of the above)

> Start local. Move to a shared location the moment a **second** consumer appears — not before.
> One consumer means it's not shared yet; lifting it early is premature abstraction.
