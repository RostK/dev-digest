# Spec: Agent Performance dashboard  |  Spec ID: SPEC-09  |  Status: approved
Supersedes: none
Date: 2026-07-11
Module: cross

## Problem & why
DevDigest already surfaces per-agent *quality* aggregates (accept-rate, findings-by-severity,
findings-per-run trend) via the L07 Stats work (`AgentStats` contract, `observability.ts`), and a
first `AgentPerf` shape (`GET /agents/performance`, `productionize.ts`) that adds `cost_by_agent` /
`cost_by_model` donuts. What is missing is the **money story over time**: an operator cannot see how
an agent's spend trends, whether the cost per *useful* (accepted) finding is reasonable, or — the
capstone acceptance test — that the "cost surgery" lab actually produced a durable, visible drop in
spend. Cost is currently computed only per-run at read time (`runCostUsd` = tokens × price book), so
there is no server-side, reconcilable, time-bucketed view of spend that an operator can trust against
the OpenRouter dashboard. This feature adds that view on top of the existing Stats, closing the
course's "productionize / cost discipline" loop.

## Goals / Non-goals
**Goals**
- Extend the existing Agent Performance surface with a **cost-over-time series per agent** whose time
  span covers before *and* after the cost-surgery lab, so the downward step-change is locatable.
- Add **cost per useful finding** (agent cost ÷ accepted findings) as a first-class per-agent metric.
- Keep the existing **cost breakdown by model** (and by agent) distribution.
- Compute every aggregate with **server-side SQL** over `agent_runs` + `findings` + `reviews`, scoped
  by `workspace_id`, so the numbers are reproducible and reconcilable against OpenRouter's spend.
- Render it at the already-reserved `/agent-performance` studio route using the existing
  `@devdigest/ui` chart primitives (`LineChart`, `Donut`, `Sparkline`, `MetricCard`, `BarRow`).

**Non-goals**   <!-- explicit boundaries — what we are NOT doing -->
- **Plugin Export/Import** (`PluginBundle`, `/plugins/export|import`, `installed_plugins`) — a
  SEPARATE spec. Not in scope here even though it shares the L08 `productionize.ts` file.
- **Weekly Digest** (`Digest`, `/digest/run`, `digests` table) — separate feature, out of scope.
- The three hand-authored course deliverables (`cost-audit.md`, `rollout-30day.md`,
  `final-retro.md`) are personal markdown, NOT product features — out of scope.
- Changing how per-run cost is *computed* (the `PriceBook` / `estimateCost` pricing source) — this
  spec only *persists* that computed value into `agent_runs.cost_usd` at write time (AC-14); it does
  not alter the pricing math.
- Real-time / streaming updates of the dashboard while a run is in flight — a manual refresh is
  acceptable for v1.

## User stories
- As a cost-conscious operator, I want to see each agent's spend trend over time, so that I can
  confirm the cost-surgery lab produced a lasting drop rather than a one-off dip.
- As an operator, I want a "cost per useful finding" number per agent, so that I can compare agents on
  value-for-money, not just raw spend.
- As an operator, I want cost broken down by model, so that I can see which models dominate spend.
- As an auditor, I want the dashboard's total spend to reconcile with the OpenRouter dashboard within
  a stated tolerance, so that I can trust the numbers.

## Acceptance criteria (EARS)
- **AC-1** — WHEN an operator opens `/agent-performance`, the system SHALL render, per agent scoped to
  the current `workspace_id`: runs, findings_total, accepted, dismissed, accept_rate, avg_cost_usd,
  total_cost_usd, avg_latency_ms, and last_run_at, sourced from `agent_runs`/`findings`/`reviews`.
  - Verify: `*.it.test.ts` — seed two agents' runs+findings, assert the response matches the
    contract and the per-agent aggregates.
- **AC-2** — The system SHALL expose a per-agent **cost-over-time series** bucketed by **day**
  (`GROUP BY` the run date in SQL), ordered oldest→newest, over a default window of the last **~8 weeks**
  (the course span, guaranteed to cover before *and* after the cost-surgery cutover) that is
  **operator-selectable**, so the step-change is present in the returned data.
  - Verify: `*.it.test.ts` — seed high-cost runs before date D and low-cost runs after D across
    multiple days; assert the series has one point per day, is ordered oldest→newest, and shows the
    drop across the boundary; assert an operator-supplied window narrows/widens the returned range.
- **AC-13** — The system SHALL read the cost-surgery **cutover date from configuration** (a
  deterministic, reproducible value — not runtime input) and include it in the performance payload so
  the client can draw a **labelled vertical marker** on the cost-over-time chart at that date.
  - Verify: unit — the configured cutover date is surfaced verbatim in the payload; component test —
    the line chart renders a labelled vertical marker at the configured date.
- **AC-3** — The system SHALL compute **cost per useful finding** per agent as `total_cost_usd ÷
  accepted`, where `accepted` counts `findings.accepted_at IS NOT NULL` attributed to that agent.
  - Verify: unit — cost-per-finding math on known inputs; `*.it.test.ts` for the attribution join.
- **AC-4** — IF an agent has zero accepted findings, THEN the system SHALL report its cost-per-useful-
  finding as `null` (rendered as "—", never `$0.00` or an Infinity/NaN value).
  - Verify: unit — denominator-zero returns null; component test renders "—".
- **AC-5** — The system SHALL compute cost aggregates as **pure server-side SQL** (`SUM()` /
  `GROUP BY`) over a persisted per-run `agent_runs.cost_usd` column in a bounded number of grouped
  queries (no per-run or per-agent round-trips / N+1, no read-time price lookup in the aggregation
  path).
  - Verify: `*.it.test.ts` — assert query count is bounded and the SQL `SUM`/`GROUP BY` over
    `cost_usd` matches a reference computation.
- **AC-14** — WHEN an `agent_run` is recorded, the system SHALL compute its cost via the existing
  read-time pricing source (`estimateCost` / `PriceBook`, tokens × price) and **freeze** the result
  into the new `agent_runs.cost_usd` column, so aggregates are immune to later price-book drift and
  reconcilable against OpenRouter. The column is added as an **additive, nullable** schema change via
  regenerated migrations (`pnpm db:generate` — migrations are NOT hand-edited).
  - Verify: `*.it.test.ts` — recording a run with known tokens+model persists the expected
    `cost_usd`; a subsequent price-book change does NOT alter the stored value.
- **AC-6** — The system SHALL provide a **cost breakdown by model** (and by agent) as
  `{label, value}` segments suitable for the `Donut` primitive, summing to the same total spend the
  summary reports.
  - Verify: unit — segments sum to `summary.total_cost_usd`; `*.it.test.ts` for the grouping.
- **AC-7** — WHEN a run's `cost_usd` is NULL (unknown/unpriced model, missing token counts, or a
  pre-migration row with no frozen cost), the system SHALL treat that run's cost as unavailable, SHALL
  NOT count it as `$0` in any priced total, breakdown, or trend, and SHALL surface it in a **labelled
  `unpriced (N runs)` bucket/indicator** so excluded runs are visible and never silently dropped.
  - Verify: unit — an unpriced run contributes null (not 0) to priced totals and increments the
    unpriced count; `*.it.test.ts` asserts priced totals exclude it while the `unpriced` count reports
    it; component test renders the `unpriced (N runs)` indicator.
- **AC-8** — WHILE viewing the dashboard, an operator SHALL be able to visually locate the downward
  step in an agent's cost-over-time chart after the cost-surgery lab, aided by the labelled vertical
  cutover marker (AC-13); the chart y-axis and daily point density MUST make the drop distinguishable,
  not flattened away.
  - Verify: manual / e2e — open `/agent-performance` on the seeded before/after dataset and confirm
    the step and the labelled cutover marker are visible on the line chart.
- **AC-9** — The system SHALL scope every aggregate, series, and breakdown to the caller's
  `workspace_id` resolved via `getContext`, so no other tenant's runs, findings, or spend appear.
  - Verify: `*.it.test.ts` — two workspaces; each sees only its own totals.
- **AC-10** — The dashboard's reported **local-run** spend (runs where `agent_runs.source = 'local'`)
  for a period SHALL reconcile with the OpenRouter dashboard total for the same period within **±10%**
  (the band accounts for the approximate static fallback pricing); `ci` and any other-source runs are
  EXCLUDED from the reconciled figure.
  - Verify: manual — for a chosen window, compare the dashboard's `source='local'` `total_cost_usd`
    against the OpenRouter dashboard total for that window and confirm agreement within ±10%; unit
    tests pin the computation the manual check reconciles against.
- **AC-11** — WHEN there are no runs in the workspace (fresh install), the system SHALL render an
  empty-state dashboard (zeroed summary, empty charts) rather than an error.
  - Verify: component test — empty dataset renders the empty state; `*.it.test.ts` returns zeros.
- **AC-12** — All user-facing labels on the dashboard SHALL come from `next-intl` namespaces (no
  hardcoded strings), and the charts SHALL expose an accessible text alternative for their data.
  - Verify: component test — strings resolve from messages; charts have accessible
    names/roles.
- **AC-15** — Runs/findings whose `agent_id` IS NULL (deleted agent) SHALL be grouped under a
  labelled **"(deleted agent)"** bucket, EXCLUDED from the per-agent trend rows, but STILL included in
  the overall/workspace spend totals so the grand total remains reconcilable.
  - Verify: `*.it.test.ts` — seed a run with NULL `agent_id`; assert it is absent from per-agent rows,
    present in the "(deleted agent)" bucket, and included in `summary.total_cost_usd`.

## Edge cases
- **Deleted agent**: `agent_runs.agent_id` / `reviews.agent_id` go `NULL` on agent delete — orphaned
  runs/findings still carry cost. These are grouped under a **"(deleted agent)"** bucket: EXCLUDED
  from the per-agent trend rows, but STILL counted in the overall/workspace spend totals so the grand
  total stays reconcilable (AC-15).
- **Multi-agent runs**: a run fanned out from a `multi_agent_runs` row (`agent_runs.multi_agent_run_id`
  set) still has its own `agent_id` + `model` + tokens — it MUST be counted exactly once, not
  double-counted via the multi-run linkage.
- **CI vs local runs**: `agent_runs.source ∈ {'local','ci'}`. Both appear in the dashboard's spend
  aggregates, but only `source='local'` spend is counted toward the OpenRouter reconciliation figure
  (AC-10); `ci`/other sources are excluded from that reconciled total.
- **Only failed runs for an agent**: no priced runs → total_cost_usd null, cost-per-finding null,
  empty trend — must render gracefully (see AC-4/AC-7/AC-11).
- **Price book staleness**: `PriceBook` refreshes lazily on a 6h TTL and falls back to an APPROXIMATE
  static table. Because cost is now frozen into `agent_runs.cost_usd` at write time (AC-14), a later
  price refresh does NOT retroactively shift historical aggregates; the approximate static fallback is
  what the ±10% reconciliation band (AC-10) accounts for.
- **Large history**: aggregation must stay bounded as `agent_runs`/`findings` grow (see Non-functional
  Perf); no existing index leads with `agent_id` for a workspace-wide grouping.

## Assumptions & Dependencies
**Assumptions**
- "Accepted finding" = `findings.accepted_at IS NOT NULL`; "dismissed" = `dismissed_at IS NOT NULL`;
  the two are mutually exclusive (the setters null the other column). This is the useful-finding
  denominator.
- Per-run cost is computed from `agent_runs.model` + `tokens_in`/`tokens_out` via the existing pricing
  source (`estimateCost` / `PriceBook`) at **run-record (write) time** and frozen into a new
  `agent_runs.cost_usd` column; aggregation then reads that persisted value, not the read-time pricing
  path. The read-time pricing source remains the single computation of `cost_usd`.
- The new `agent_runs.cost_usd` column is added **additively and nullable** (via regenerated
  migrations, `pnpm db:generate` — never hand-edited). Pre-existing rows are **not** backfilled with a
  hand-written data migration (which would violate the do-not-hand-edit-migrations rule); they keep
  `cost_usd = NULL` and surface under the `unpriced (N runs)` bucket (AC-7). This keeps the change a
  course-safe, non-breaking, purely additive schema change.
- The existing `AgentPerf` / `AgentPerfRow` contract in `productionize.ts` is the extension point; new
  fields (cost-over-time series, cost-per-useful-finding) are added to it rather than a rewrite.
- Only `status='done'` runs carry meaningful cost/latency for aggregation; failed/cancelled/running
  runs contribute to counts where relevant but not to spend.

**Dependencies**
- `agent_runs`, `run_traces`, `reviews`, `findings` tables (schema/`runs.ts`, schema/`reviews.ts`).
- Pricing source: `adapters/llm/pricing.ts` (`estimateCost`/`runCostUsd`) and `platform/price-book.ts`
  (`PriceBook`, live OpenRouter prices) — the single source of per-run cost.
- L07 `AgentStats` (`observability.ts`) and L08 `AgentPerf` (`productionize.ts`) contracts.
- Client `@devdigest/ui` chart primitives (`src/vendor/ui/charts/*`) and the reserved
  `/agent-performance` nav slot (`app-shell/helpers.ts`).

## Non-functional   <!-- only where relevant -->
- **Perf**: aggregates SHALL be produced by grouped SQL over `agent_runs`/`findings`/`reviews`, not
  per-run round-trips; the query set MUST stay bounded (O(1) queries, not O(agents)) and remain
  responsive as run/finding volume grows. A workspace+agent+time index may be warranted (implementation
  concern — see Proposed improvements).
- **Security**: read-only endpoint; no secrets touched; cost derived from token counts, never from a
  provider key. Never log spend against a key.
- **Privacy**: no PII beyond agent/model names already stored; nothing new persisted.
- **Tenancy**: every query scoped by `workspace_id` (AC-9).
- **a11y**: charts keyboard/AT-reachable with a text alternative (AC-12).
- **i18n**: all labels via `next-intl` namespaces (AC-12).

## Inputs (provenance)   <!-- where each input comes from -->
- runs / model / provider / tokens / duration / ran_at / source — [reused] `agent_runs` (deterministic).
- finding acceptance state — [reused] `findings.accepted_at` / `dismissed_at` via `reviews` join.
- per-run cost — [deterministic: tokens × price book, frozen at write time into `agent_runs.cost_usd`]
  (`estimateCost`/`PriceBook`), NO new LLM calls.
- cost-surgery cutover date — [config value] (deterministic, reproducible), drives the chart marker.
- No new LLM calls are made by this feature.

## Untrusted inputs   <!-- reads third-party text? -->
- Agent names and model slugs are workspace-authored (semi-trusted) and are rendered as chart
  labels/segments — treated as DATA, not markup; React escaping applies. No third-party PR/repo text
  is read by this feature.

## Cross-module impact   <!-- how this talks to other modules; blast radius -->
- client (`/agent-performance` page + a `src/lib/hooks/*` TanStack Query hook) → server
  `GET /agents/performance` (extended contract). Grounded in: client README route map + reserved nav
  slot.
- server aggregation reads `agent_runs` + `findings` + `reviews` — owned by the reviews/agents
  modules; the endpoint must not reach into another module's internals (resolve repos via the
  Container per onion rules). Grounded in: server/CLAUDE.md, onion-architecture.
- Shares the per-run cost source (`pricing.ts` / `PriceBook`) with the existing per-run cost display
  (`RunSummary.cost_usd`), so both surfaces stay consistent. Grounded in: `run.repo.ts`.

## Proposed improvements   <!-- design gaps / corner cases / UX surfaced during review -->
- **Persist cost per run**: ADOPTED (NC-2, AC-14) — a frozen `agent_runs.cost_usd` written at
  run-record time lets cost aggregate in pure SQL (AC-5) and immunizes totals against price-book
  drift, directly helping OpenRouter reconciliation. Added as an additive nullable column via
  regenerated migrations; pre-existing rows stay NULL and count as `unpriced` rather than being
  backfilled by a hand-written data migration.
- **Cutover annotation**: ADOPTED (NC-4, AC-13/AC-8) — the config-sourced cost-surgery date is drawn
  as a labelled vertical marker on the cost-over-time chart so the step is unambiguous.
- **Unpriced-spend visibility**: ADOPTED (NC-3, AC-7) — an explicit `unpriced (N runs)` indicator so
  excluded runs are visible and reconciliation trust is preserved.
- **Index for the aggregation**: an `agent_runs (workspace_id, agent_id, ran_at)` index would serve the
  workspace-wide per-agent time grouping; today's indexes lead with `pr_id`. Status: open
  (implementation detail for the planner).
