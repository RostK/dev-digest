# Folder structure — concrete layouts & scaling

How to lay out files as an app grows, with full trees for React (Vite) and Next.js (App Router).

## The scaling progression

Don't jump to the biggest structure. Move to the next stage only when the current one hurts.

1. **Single file** → a few components in one file.
2. **Multiple files** → one component per file, flat in `src/`.
3. **Component folders** → a folder per component with colocated test/styles/subparts.
4. **Technical folders** → group by kind: `components/`, `hooks/`, `utils/`, `context/`.
5. **Feature folders** → group by domain: `features/auth/`, `features/billing/`, each owning its own
   components/hooks/api/types. Shared code stays in top-level technical folders.
6. **Domain / packages / monorepo** → extract shared domains into packages when multiple apps consume them.

Most production apps live at **stage 5**.

## Type-based vs feature-based

- **Type-based** groups by what a file *is* (`components/`, `hooks/`, `utils/`). Simple; fine for
  small apps. Breaks down when a folder holds dozens of unrelated files and a single change touches
  many folders.
- **Feature-based** groups by what a file *does* (`features/checkout/`). A change to a feature stays
  in one folder. The default for scaling apps.

You can mix: feature folders for domains + a small set of shared technical folders. Just don't apply
both inconsistently to the same kind of code.

## React (Vite) — feature-based baseline

```text
src/
├── app/                      # app shell: providers, router, root layout
├── components/               # shared, cross-feature UI
│   └── ui/                   # design-system primitives (Button, Card, Input)
├── features/
│   ├── auth/
│   │   ├── components/       # feature-only components
│   │   ├── hooks/            # feature-only hooks
│   │   ├── api/              # data-fetch / mutation functions for this feature
│   │   ├── utils/            # feature-specific helpers
│   │   ├── types.ts          # feature-only types
│   │   ├── constants.ts      # feature-wide constants
│   │   └── index.ts          # PUBLIC API — the only thing other code imports
│   └── billing/
│       └── …                 # same shape
├── hooks/                    # shared hooks (used by 2+ features)
├── lib/                      # stateful integrations (api client, auth sdk, analytics)
├── utils/                    # pure, generic helpers
├── types/                    # shared/global types
├── config/                   # env, app-wide constants
└── stores/                   # shared client state (if a store library is used)
```

## Feature-folder anatomy

A feature is a vertical slice. Rules:

- **Self-contained:** everything the feature needs that nothing else needs lives inside it.
- **Public API via `index.ts`:** other code imports `features/auth`, never
  `features/auth/components/LoginForm/internal-bit`. Keep the barrel **thin** (re-export only the
  feature's intended surface).
- **No cross-feature imports:** `billing` must not import from `auth`. If both need something, lift
  it to a shared top-level folder (`components/`, `hooks/`, `lib/`, `utils/`, `types/`).
- **Promotion rule:** code starts inside the feature; it moves to shared only when a second feature needs it.

## Colocation, concretely

Put the satellites of a component next to it:

```text
features/billing/components/InvoiceTable/
├── InvoiceTable.tsx
├── InvoiceTable.test.tsx
├── InvoiceRow.tsx            # private subcomponent
├── use-invoice-sort.ts       # private hook
└── invoice-table.helpers.ts  # private helpers
```

Promote any of these out of the folder only when something **outside** the folder needs them.

## Dependency direction (enforce it)

```text
shared (components, hooks, lib, utils, types, config)
        ▲
     features            (may import shared; NOT other features)
        ▲
   app / routing         (may import features + shared)
```

Enforce with ESLint `import/no-restricted-paths` so violations fail CI instead of relying on discipline.

For Next.js specifics (where `app/` fits, route groups, private folders, server/client split) see
**nextjs-app-router.md**.
