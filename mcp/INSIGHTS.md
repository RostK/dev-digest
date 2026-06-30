# mcp — `@devdigest/mcp` — Engineering Insights

Durable, non-obvious learnings for the DevDigest MCP server. Append-only; correct a
stale record with a newer dated note beneath it, never by rewriting.

## What Works

- 2026-06-30 — Validate runtime config with a `loadConfig(env: NodeJS.ProcessEnv = process.env)`
  function (not a top-level `const` reading `process.env` inline). Taking the env bag as a
  parameter makes every coercion/validation branch unit-testable without mutating the real
  `process.env`. Evidence: `mcp/src/config.ts`, `mcp/test/config.test.ts`.

## What Doesn't Work

- 2026-06-30 — Never coerce numeric env vars with bare `Number(process.env.X ?? default)`.
  A typo like `MCP_REVIEW_TIMEOUT_MS=abc` becomes `NaN` and the server starts **silently**;
  the breakage only surfaces downstream in `poll.ts`, where
  `maxAttempts = Math.max(1, Math.ceil(NaN / intervalMs))` is `NaN`, so the loop guard
  `attempt < NaN` is false on the first check — `waitForRun` **never polls once** and every
  `run_agent_on_pull_request` immediately throws a bogus "still running after NaNs" timeout.
  Fix: Zod (`z.coerce.number().int().positive()`, `z.string().url()`) that fails fast and
  names the offending env var. Evidence: `mcp/src/config.ts`, `mcp/src/poll.ts:49`.

## Codebase Patterns

- 2026-06-30 — The compact mappers in `format.ts` strip token-heavy fields, but a "lean"
  tool output must still keep the **short, required fields the model selects on**. For
  `list_agents`/`toAgentRef` that is `model` + `description` (both `z.string()`, required on
  the `Agent` contract) — they are the criteria a model uses to pick an agent for
  `run_agent_on_pull_request`. "Drop token-heavy fields" ≠ "drop every field but id/name".
  Evidence: `mcp/src/format.ts` (`toAgentRef`), `mcp/src/tools/list-agents.ts` (outputSchema).

## Decisions

- 2026-06-30 — Kept `description` and `model` in `AgentRef` (5 keys, not 3). Rejected the
  fully-minimal `{id,name,enabled}` shape: without `model`/`description` a model cannot
  meaningfully disambiguate agents, and both fields are short — they are not the
  token-heavy metadata the compaction was meant to drop (`system_prompt`, `output_schema`
  stay dropped). Evidence: `mcp/src/format.ts`.

## Tool & Library Notes

- 2026-06-30 — Zod `z.coerce.number().int().positive().default(N)`: `.default()` short-circuits
  on `undefined` **before** the inner schema runs, so an unset env var yields `N` (not
  `Number(undefined) → NaN`). Coercion + validation only run when the value is present —
  exactly the behavior you want for optional env config. Evidence: `mcp/src/config.ts`.

## Recurring Errors & Fixes

_(none recorded yet — a record belongs here only after the same error is seen more than once.)_

## Session Notes

- 2026-06-30 — Seeded this file (mcp/ was the only top-level package without an
  `INSIGHTS.md`). Source: three review findings on `feat/L04-mcp-server` — config NaN
  silent-start, over-compacted `list_agents`, and the missing INSIGHTS.md itself.

## Open Questions

_(none yet.)_
