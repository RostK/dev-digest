# Severity rubric & the critical gate

Four levels. **Only `critical` blocks** the push / PR; the rest are reported and pass. Keep the
bar predictable — severity comes from the routed skills' own "Architecture smells" lists and the
security checklist, not from taste.

## critical — blocks the gate

Ships broken, unsafe, or irreversible behavior. If a finding is critical, the diff cannot be
pushed until it's fixed and the review re-run. The canonical critical set for this repo:

| # | Critical finding | Source skill(s) |
|---|---|---|
| 1 | A secret committed, logged, or reaching a `"use client"` module graph / client bundle | security, frontend-ui-architecture, onion-architecture |
| 2 | An endpoint missing authorization, or open to injection / IDOR | security, fastify-best-practices |
| 3 | A Drizzle query **not scoped by `workspace_id`** (cross-tenant data leak) | onion-architecture, drizzle-orm-patterns |
| 4 | A hand-edited migration, or a destructive migration (drop/narrow) risking data loss | postgresql-table-design, drizzle-orm-patterns |
| 5 | A forked / out-of-sync `vendor/shared` contract copy (server vs client) | onion-architecture, zod |
| 6 | Boundary validation dropped — no schema-first route, or no `safeParse` on LLM/external output | zod, onion-architecture |
| 7 | `reviewer-core` (or a `vendor/shared` contract) importing from `server/` / a framework — engine purity broken | onion-architecture |
| 8 | A secret read via `process.env` instead of `container.secrets`, or a `new Adapter(...)` bypassing the Container | onion-architecture, security |

These map directly to the project's stated invariants (CLAUDE.md "Do-not-touch", the onion
skill's smells, the security checklist). Treat the list as the floor — a genuinely equivalent
data-loss / auth-bypass / secret-leak issue not listed here is still critical.

## high — fix before merge, does not block

Real defects that don't ship unsafe behavior: a logic bug, a missing error path, an `any` that
defeats a boundary type, a React effect with a wrong/missing dependency, business logic or data
fetching sitting in a component body, a route returning a raw DB row instead of a contract DTO.

## medium — should fix

Maintainability and correctness-adjacent: a cross-feature deep import, a junk-drawer
`utils.ts`, prop-drilling a composition would remove, a missing test for new branching logic,
an N+1 query, a non-schema-first `.parse` in a handler.

## low — nit

Naming, placement, formatting, a redundant comment, a micro-simplification. Report at most a
handful; don't pad.

## Counting & recording

- The gate verdict is **`blocked` iff `criticalCount > 0`**, else `clean`.
- Dedup first: the same underlying issue flagged by two skills counts once (highest severity).
- Record with the helper so the hash is authoritative:
  `node .claude/skills/pr-self-review/hooks/pr-gate.mjs record --verdict <clean|blocked> --criticals <N>`
- Re-run `record` after any fix — it re-stamps the current diff hash, otherwise the hook treats
  the review as stale.
