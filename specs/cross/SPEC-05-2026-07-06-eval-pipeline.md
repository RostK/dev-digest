# Spec: Eval Pipeline (agent regression harness)  |  Spec ID: SPEC-05  |  Status: approved
Supersedes: none
Date: 2026-07-06
Module: cross

## Problem & why
When a user tunes a review agent — edits its system prompt, swaps the model, links a new skill — they have no
numerical way to know whether the agent got **better or worse**. Today the only signal is eyeballing the next PR
review. DevDigest already ships the raw material for a regression safety-net: every finding a user **accepts** or
**dismisses** is a labelled judgement, and the starter DB already carries `eval_cases` / `eval_runs` tables plus
`EvalCase` / `EvalRun` / `EvalDashboard` Zod contracts. This feature wires those into a **product-level eval
system**: the user turns a real finding into an eval case in one click, runs the agent against the whole case set,
and reads `recall` / `precision` / `citation_accuracy` — computed **100% in code with zero LLM calls** — so a
prompt change **visibly moves the numbers** between two runs, and two runs can be compared side by side ("old
prompt vs new"). This is distinct from the repo's `evals/` harness (which tests our own skills/agents against
model traces); this is the app's own product feature over real user data.

## Goals / Non-goals
**Goals**
- **One-click case authoring from a real finding**: from an **accepted** finding, create a `must_find` case
  ("this finding at `file:line` must be found"); from a **dismissed** finding, create a `must_not_flag` case
  ("this finding must NOT be produced"). The case's fixed input (`input_diff` / `input_files` / `input_meta`) is
  captured from the PR the finding came from, so re-running is reproducible across agent versions.
- **A concrete expectation contract**: define an `EvalExpectation` Zod shape (replacing the current
  `expected_output: z.unknown()`) that encodes the expectation `kind` plus a list of
  `{ file, start_line, end_line, severity?, category?, title? }` finding skeletons, added to **both**
  vendored `@devdigest/shared` copies and tightening `expected_output` in `EvalCase`
  (`contracts/knowledge.ts`) and `EvalCaseInput` (`contracts/eval-ci.ts`). See the **Scoring & matching**
  appendix for the frozen shape and the match / dedup rules.
- **See an agent's cases**: list every eval case owned by an agent (`owner_kind='agent'`, `owner_id=<agentId>`),
  each showing its expectation type, expected-vs-actual finding count, and last-run pass/fail/never-run state.
- **Run the whole set**: `POST /agents/:id/eval-runs` mints a `group_id`, snapshots the agent's current
  `system_prompt` + `version`, then executes the agent against **every** case in its set, feeding each case's
  fixed input through the **same** `reviewer-core` `reviewPullRequest` engine used by real reviews, and persists
  one `eval_runs` row per case tagged with that `group_id` / `agent_version` / `system_prompt`. There is **no**
  separate `eval_run_groups` table — the run-group is modelled as nullable columns on `eval_runs`
  (`group_id uuid`, `agent_version integer`, `system_prompt text`) added by a new `pnpm db:generate` migration;
  run-level aggregate metrics are computed **on read** by grouping `eval_runs` on `group_id`.
- **Deterministic, LLM-free scoring**: `recall` / `precision` / `citation_accuracy` are computed **in code** from
  the engine's grounded output and the case expectations, reusing the `file-matches + line-ranges-overlap` rule
  already implemented in `reviewer-core/src/grounding.ts` — never an LLM judge, never the model's self-reported
  score.
- **Run history + side-by-side compare**: list an agent's run-groups (newest first) with their metrics and agent
  version; select two `group_id`s and compare their metric deltas old→new plus both `system_prompt` snapshots so
  the Compare modal can diff the prompts.
- **Agent-scoped eval surface in the UI**: a "Turn into eval case" action on `FindingCard`; an **Evals tab** in
  the Agent editor (`/agents/[id]?tab=evals`: case list + run history + "Run all" + "New eval case", linking to
  the agent-scoped dashboard via "View full dashboard →"); an agent-scoped **Eval Dashboard** at
  `/evals/[agentId]` (`current` metrics with deltas, a trend line, recent runs, a 2-run Compare, an alert banner)
  served by the existing `EvalDashboard` contract; and a **global Eval Dashboard** at `/evals` (read-only listing
  of recent runs across all agents + per-agent summary rows), reached from a new "Eval Dashboard" nav item under
  SKILLS LAB in `client/src/vendor/ui/nav.ts`.
- **A green `pnpm verify:l06`**: a `server`-scoped script (mirroring `verify:l03`) that runs a targeted
  `vitest run` exercising the **real** scorer over **real recorded review-output fixtures** — genuine
  `ReviewOutcome` captures from actual agent runs checked into the test suite, **not** a mock provider — so the
  gate proves the real scoring path works and that a prompt change moves `recall`/`precision` (a good-prompt
  capture vs a deliberately-broken-prompt capture), all deterministic with no Postgres, no Docker, no API key,
  and zero real LLM/network calls. A root `package.json` passthrough (`verify:l06: cd server && pnpm verify:l06`)
  makes the bare `pnpm verify:l06` work from the repo root; because the packages are **not** a pnpm workspace,
  this passthrough is explicit.
- **Tenancy + untrusted-input discipline**: every eval route scopes by `workspace_id`; the user-supplied diff and
  expected-output JSON in a case are treated as untrusted data.

**Non-goals**   <!-- explicit boundaries — what we are NOT doing -->
- **Not** the repo's `evals/` harness (skill/agent traces on cheap models via OpenRouter). This is the product
  eval feature over real accept/dismiss data; the two are unrelated.
- **Not** an LLM-judged / semantic scorer. Matching is purely `file + line-overlap`; no embedding or model call
  enters scoring.
- **Not** the "Promote v7" action (mockup 5), CI export, or ingesting CI-run artifacts. The **global** Eval
  Dashboard (mockup 6) **is** in v1 scope but strictly read-only (list recent runs across all agents + per-agent
  summary rows); a global **"Run all agents"** trigger is a non-blocking nice-to-have and is **not** required —
  the only required run trigger is the agent-scoped `POST /agents/:id/eval-runs`.
- **Not** editing skill-owned eval cases (`owner_kind='skill'`); v1 targets `owner_kind='agent'` only. Skill
  cases may exist in the table but are out of this feature's surface.
- **Not** replaying a **past** agent version's config for a run — a run uses the agent's **current** config; the
  run-group columns only *record* the `agent_version` and `system_prompt` snapshot it ran under.
- **Not** a scheduler / auto-run on agent edit — runs are user-triggered.
- **Not** re-implementing diff parsing or the line-overlap rule; the scorer reuses `grounding.ts` helpers.

## User stories
- As a reviewer tuning an agent, I want to turn an accepted finding into a `must_find` eval case in one click, so
  that the agent is held to catching that issue on every future prompt.
- As a reviewer, I want to turn a dismissed finding into a `must_not_flag` case, so that a prompt change that
  reintroduces that false positive is caught numerically.
- As a reviewer, I want to run my agent against its whole case set and see `recall`/`precision`/`citation_accuracy`,
  so that I can tell at a glance whether an edit improved the agent.
- As a reviewer, I want to compare two runs (old prompt vs new) side by side, so that I can see exactly which
  metric moved and why (the prompt diff).
- As a maintainer, I want scoring to be deterministic and LLM-free, so that the metric is reproducible and the
  eval itself costs nothing.

## Acceptance criteria (EARS)
<!-- Stable IDs; each one testable with a Verify hint. -->

- **AC-1** — WHEN the user invokes "Turn into eval case" on an **accepted** finding, the system SHALL create an
  `eval_cases` row with `owner_kind='agent'`, `owner_id` = the review's agent, the PR's diff captured into
  `input_diff` (and files/meta into `input_files`/`input_meta`), and `expected_output` encoding a `must_find`
  expectation carrying the finding's `{ file, start_line, end_line }`.
  - Verify: `*.it.test.ts` — accept a finding, call the create endpoint, assert the persisted row's
    `owner_kind`/`owner_id`/`input_diff` and `expected_output.kind === 'must_find'` with the finding's file+lines.
- **AC-2** — WHEN the user invokes "Turn into eval case" on a **dismissed** finding, the system SHALL create an
  `eval_cases` row whose `expected_output` encodes a `must_not_flag` expectation carrying the finding's
  `{ file, start_line, end_line }`.
  - Verify: `*.it.test.ts` — dismiss a finding, create the case, assert `expected_output.kind === 'must_not_flag'`.
- **AC-3** — The system SHALL define an `EvalExpectation` contract in **both** vendored `@devdigest/shared`
  copies (`server/src/vendor/shared` and `client/src/vendor/shared`, edited in lockstep — never forked into a
  divergent copy) shaped
  `{ kind: 'must_find' | 'must_not_flag', findings: Array<{ file, start_line, end_line, severity?, category?, title? }> }`,
  and SHALL tighten `expected_output` from `z.unknown()` to `EvalExpectation` in both `EvalCase`
  (`contracts/knowledge.ts`) and `EvalCaseInput` (`contracts/eval-ci.ts`).
  - Verify: unit — `EvalExpectation.safeParse` accepts a well-formed `must_find` and `must_not_flag` payload and
    rejects a malformed one; both vendored copies export the identical schema.
- **AC-4** — WHEN the user runs `POST /agents/:id/eval-runs`, the system SHALL mint a `group_id`, snapshot the
  agent's current `system_prompt` + `version`, execute the agent against **every** case in its set by feeding each
  case's fixed `input_diff` through `reviewer-core` `reviewPullRequest` with the agent's current
  `system_prompt`/`model`/`strategy`/enabled skills, and SHALL persist one `eval_runs` row per case tagged with
  that `group_id` / `agent_version` / `system_prompt` (nullable columns added by a new migration; no separate
  `eval_run_groups` table).
  - Verify: `*.it.test.ts` — seed ≥2 cases, POST the run with a provider that replays a recorded `ReviewOutcome`
    fixture, assert one `eval_runs` row per case, all sharing one `group_id` with the snapshotted `agent_version`
    and `system_prompt`.
- **AC-5** — The system SHALL compute a per-case `recall_case` for every `must_find` case as
  `(# expected findings matched) / (# expected findings)`, where a match requires the **same file** AND the
  expected `[start_line, end_line]` **overlapping** the produced (grounded) finding's range — reusing the
  intersection rule from `reviewer-core/src/grounding.ts` (`rangeIntersects` / `buildLineIndex`), honouring the
  full-file-kind exemption (match on file presence only). The run-level `recall` SHALL be the **mean** of
  `recall_case` over the `must_find` cases; a case with **0** `must_find` expectations is **excluded** from the
  recall average (recall undefined for that case), and a run with no `must_find` case at all reports `recall = 1`
  (vacuous). See the **Scoring & matching** appendix.
  - Verify: unit — a `must_find` case with 2 expected + 1 matched produced finding yields `recall_case === 0.5`;
    a run of two `must_find` cases at `recall_case` `0.5` and `1.0` yields run `recall === 0.75`; a run with no
    `must_find` case yields `recall === 1`.
- **AC-6** — The system SHALL compute a per-case `precision_case` for **every** case (STRICT) as
  `(# produced findings that match an expected `must_find` finding) / (# produced findings)`, so that **any**
  produced finding not matching an expected `must_find` finding lowers precision — including any produced finding
  that matches a `must_not_flag` forbidden region (a false positive). WHEN a case produced **0** findings,
  `precision_case = 1.0` (vacuously no false positives). The run-level `precision` SHALL be the **mean** of
  `precision_case` over **all** cases. See the **Scoring & matching** appendix.
  - Verify: unit — a case producing 1 finding overlapping a `must_not_flag` skeleton yields `precision_case < 1`;
    a case producing only matched `must_find` findings yields `precision_case === 1`; a case producing 0 findings
    yields `precision_case === 1`.
- **AC-7** — The system SHALL compute the run-level `citation_accuracy` as **pooled** across the run:
  `total_kept / (total_kept + total_dropped)`, summing `kept`/`dropped` from every case's `reviewPullRequest`
  `ReviewOutcome` (`review.findings` kept + `dropped[]`), and SHALL report `1` when the run produced zero raw
  findings (empty denominator).
  - Verify: unit — a run over two cases with pooled `(kept, dropped)` of `(3, 1)` yields
    `citation_accuracy === 0.75`; a run producing no raw findings yields `citation_accuracy === 1`.
- **AC-8** — The scorer and the whole `POST /agents/:id/eval-runs` scoring path SHALL make **zero** LLM calls;
  the only LLM call in an eval run is the agent's own `reviewPullRequest` review pass, and scoring runs entirely
  on its returned output.
  - Verify: `*.it.test.ts` — run the endpoint with a fixture-replay provider whose call-count is asserted to equal
    exactly the number of review passes (one per case), and the pure scorer unit tests inject no provider at all.
- **AC-9** — WHEN the scorer runs over two **real recorded review-output fixtures** captured from the same case
  set under **different** system prompts (a good-prompt capture that finds the expected finding; a
  deliberately-broken-prompt capture that misses it and/or adds a `must_not_flag` hit), the reported
  `recall`/`precision` SHALL move in the expected direction. The fixtures are genuine `ReviewOutcome` captures,
  not a mock provider.
  - Verify: unit — a fixture-driven vitest (part of `verify:l06`, no Postgres/Docker/API key) scores the set from
    the good-prompt capture then the broken-prompt capture and asserts recall/precision moved in the expected
    direction.
- **AC-10** — The system SHALL expose an agent's eval cases (`GET`) and its run history / run-groups (`GET`),
  each scoped by `workspace_id`, and SHALL serve an agent-scoped `EvalDashboard` (`current` metrics + `delta` vs
  the prior run-group + `trend[]` + `recent_runs[]` + `alert`) computed from persisted `eval_runs` — with **zero**
  LLM calls on the read path.
  - Verify: `*.it.test.ts` — after two runs, `GET` the dashboard and assert `current`, a non-zero `delta`, a
    `trend` of length 2, and `recent_runs`.
- **AC-11** — WHEN two `group_id`s are selected for comparison, the compare endpoint SHALL return each group's
  aggregate metrics and the metric deltas old→new (`recall`/`precision`/`citation_accuracy`/`cost_usd`), the two
  runs' `agent_version` identifiers, **and** both groups' snapshotted `system_prompt` text so the Compare modal
  can render a prompt diff without reading the agent's (possibly-since-edited) current prompt.
  - Verify: `*.it.test.ts` — compare two run-groups; assert the delta object, both `agent_version`s, and both
    `system_prompt` snapshots are returned.
- **AC-12** — The system SHALL render a "Turn into eval case" action on `FindingCard` **only** for a finding that
  is accepted or dismissed (open findings SHALL NOT show it), mapping accepted→`must_find` and
  dismissed→`must_not_flag`.
  - Verify: unit (RTL) — an accepted finding shows the action and calls the create hook with `must_find`; an open
    finding does not render the action.
- **AC-13** — The system SHALL add an **Evals** tab to the Agent editor showing the agent's cases with
  pass/fail/never-run state, a "Run all evals" control, a "New eval case" control, and a per-run summary; the tab
  SHALL invalidate its case/run queries after a create or a run.
  - Verify: unit (RTL) — the tab renders seeded cases from a mocked hook, "Run all" triggers the run mutation, and
    the list refreshes on success.
- **AC-14** — WHERE the agent's set has fewer than 8 cases, the Evals tab SHALL surface a non-blocking hint that a
  meaningful set needs **≥8 cases** (the homework's gold-set threshold), without preventing a run.
  - Verify: unit (RTL) — with 3 seeded cases the hint renders; with ≥8 it does not.
- **AC-15** — The system SHALL add a `server`-scoped `verify:l06` script (mirroring `verify:l03`) that runs a
  targeted `vitest run` over the real scorer against **real recorded review-output fixtures** — the pure-scorer
  test **and** the prompt-sensitivity test (AC-9), both driven by checked-in `ReviewOutcome` captures (no mock
  provider), needing no Postgres, no Docker, and no API key — and SHALL add a root `package.json` passthrough
  `verify:l06` (`cd server && pnpm verify:l06`) so the bare `pnpm verify:l06` works from the repo root (explicit
  because the packages are not a pnpm workspace). The script SHALL exit green making **zero** real LLM/network
  calls.
  - Verify: manual + CI — `pnpm verify:l06` from the repo root exits 0 and its run log shows no outbound
    LLM/network call.
- **AC-16** — IF a case's `input_diff` is empty or its `expected_output` fails `EvalExpectation` validation, THEN
  the run SHALL skip that case with a recorded reason (not crash the whole set) and the run-group SHALL still
  complete over the valid cases.
  - Verify: `*.it.test.ts` — seed one invalid + one valid case, run the set, assert the group completes and the
    invalid case is reported skipped.
- **AC-17** — The system SHALL compute a per-case `pass`: a `must_find` case passes IFF `recall_case == 1` AND
  `precision_case == 1` (all expected found, no false positive); a clean / `must_not_flag` case (0 `must_find`
  expectations) passes IFF the forbidden finding is absent (i.e. `precision_case == 1`). The run-level
  `traces_passed` / `traces_total` SHALL be the count of passing cases over the total number of cases in the run.
  - Verify: unit — a case with 1 expected + 1 matched, 0 extra produced findings passes; the same case producing
    0 findings (`recall_case == 0`) fails; a `must_not_flag` case with the forbidden finding absent passes and
    with it present fails; `traces_passed`/`traces_total` count over a mixed run is correct.
- **AC-18** — The system SHALL serve a **global** Eval Dashboard at `/evals` (read-only): a listing of recent
  eval runs across **all** agents plus per-agent summary rows (`recall`/`precision`/`citation_accuracy`, last-run
  timestamp), scoped by `workspace_id`, computed from persisted `eval_runs` with **zero** LLM calls; it SHALL NOT
  require a global "Run all agents" trigger (the only required run trigger is agent-scoped).
  - Verify: `*.it.test.ts` — with runs seeded for ≥2 agents, `GET /evals` returns recent runs and one summary row
    per agent with its latest metrics; and unit (RTL) — the page renders the summary rows and recent-runs list.
- **AC-19** — The system SHALL add an "Eval Dashboard" nav item under SKILLS LAB in
  `client/src/vendor/ui/nav.ts` linking to `/evals`; the agent-scoped dashboard SHALL live at `/evals/[agentId]`
  (metric trend + recent runs table + 2-run Compare); and the Agent editor's **Evals** tab
  (`/agents/[id]?tab=evals`) SHALL link to the agent-scoped dashboard via a "View full dashboard →" control.
  - Verify: unit (RTL) — nav renders the "Eval Dashboard" item under SKILLS LAB pointing at `/evals`; the Evals
    tab renders a "View full dashboard →" link resolving to `/evals/[agentId]`.

## Edge cases
- **Empty set / single case**: running an agent with zero cases returns an empty run-group (no crash); AC-14's
  ≥8 hint still applies but never blocks.
- **No `must_find` case in the run** → `recall = 1` (vacuous, all cases excluded from the recall average).
  **A case that produced no findings** → `precision_case = 1` (vacuously no false positives).
  **No raw findings across the run** → `citation_accuracy = 1`.
- **Finding with a full-file `kind`** (`secret_leak`/`lethal_trifecta`/`phantom`/`hook`): the expectation skeleton
  matches on **file present** only (no line range), mirroring `grounding.ts`'s full-file exemption.
- **The PR/review a case was born from is later deleted**: the case is self-contained (diff captured into
  `input_diff`), so it still runs; no dangling FK to `pull_requests`.
- **Duplicate expected findings within a case**: deduped by the `(file, start_line, end_line)` key before scoring,
  so the same skeleton is never double-counted in a case's denominator. Duplicate whole cases from the same
  finding are allowed (no unique constraint) and count as separate cases in the per-case averages.
- **Agent edited mid-run**: a run reads the agent's config once at run start; concurrent edits do not affect the
  in-flight group.
- **Oversized `input_diff`**: capped/validated like a normal review diff; the same `map-reduce` threshold applies
  inside the engine.
- **Malicious JSON in `expected_output`**: rejected by `EvalExpectation` validation before persistence (AC-3).

## Assumptions & Dependencies
**Assumptions**
- The starter `eval_cases` / `eval_runs` tables and the `EvalCase` / `EvalRun` / `EvalDashboard` / `EvalCaseInput`
  contracts exist and are wired as designed (verified in `server/src/db/schema/eval.ts`, `contracts/knowledge.ts`,
  `contracts/eval-ci.ts`).
- `reviewer-core` `reviewPullRequest` returns a `ReviewOutcome` with grounded `review.findings`, `dropped[]`, and
  a `grounding` "N/M passed" string (verified in `reviewer-core/src/review/run.ts`), giving `citation_accuracy`
  directly.
- `reviewer-core/src/grounding.ts` exports `buildLineIndex` / `rangeIntersects`-equivalent line-overlap logic the
  scorer can reuse for file+line matching.
- A finding record carries `accepted_at`/`dismissed_at` and `file`/`start_line`/`end_line` (verified in
  `contracts/review-api.ts` `FindingRecord` and `schema/reviews.ts`).

**Dependencies**
- A **new** Drizzle migration via `pnpm db:generate` adding nullable `group_id uuid` / `agent_version integer` /
  `system_prompt text` columns to `eval_runs` (no new table). Adding a new migration is allowed; existing
  migration SQL is never hand-edited (per `server/CLAUDE.md`).
- Both vendored `@devdigest/shared` copies (`server/src/vendor/shared` + `client/src/vendor/shared`) edited in
  lockstep for `EvalExpectation` and the tightened `expected_output` — no sync script, never forked.
- The agents module (`agents` table, `agent_versions`, `enabledSkillBodies`) and the reviews module (finding
  accept/dismiss state, PR diff loading) are read to build a case and to run it.

## Non-functional
- **Perf**: the read/dashboard path SHALL make zero LLM calls and serve from persisted `eval_runs`. An eval run's
  cost is bounded by one review pass per case (the same budget as a normal review).
- **Security**: every eval route resolves `getContext()` → `workspace_id` and scopes all `eval_cases`/`eval_runs`
  queries by it; a user cannot read or run another workspace's cases. Route bodies validated schema-first (zod)
  before the handler; throw `AppError`/`NotFoundError`/`ValidationError`, never raw errors.
- **Privacy**: `input_diff` may contain code but never secrets by policy; the eval feature neither logs the diff
  body nor sends it anywhere except the injected LLM provider (same as a normal review).
- **a11y**: the Evals tab, case list, and compare modal SHALL be keyboard-navigable with labelled controls;
  metric deltas SHALL convey direction by icon/text, not color alone.
- **i18n**: no hardcoded user-facing strings — `useTranslations` with a new `evals` namespace under
  `messages/<locale>/`.
- **Tenancy**: scoped by `workspace_id` on every query (see Security).

## Inputs (provenance)
- Finding `{ file, start_line, end_line, severity, category, title }` for the expectation skeleton — [reused] from
  the persisted `FindingRecord`.
- PR `input_diff` / `input_files` / `input_meta` captured into the case — [reused] from the review's loaded diff /
  PR record (same `loadDiff` path a real review uses).
- Agent `system_prompt` / `model` / `strategy` / enabled skill bodies / `version` — [reused] from the agents
  module at run time.
- Produced findings + `dropped[]` + `grounding` summary — [new: 1 LLM call **per case** via the agent's own
  `reviewPullRequest`]. Scoring adds **0** LLM calls.
- `recall` / `precision` / `citation_accuracy` / `pass` / `duration_ms` / `cost_usd` — [deterministic: computed in
  code from the above].

## Untrusted inputs
- **`input_diff`** (user-authored or PR-derived) — treated as DATA; it flows to the model only through the same
  delimiter-wrapped diff slot a normal review uses (`reviewer-core` `assemblePrompt` already neutralizes it).
  Never executed, never interpreted as instructions.
- **`expected_output` JSON** (user-editable in the case editor, mockup 2) — validated against `EvalExpectation`
  before persistence and before scoring; a payload that fails validation is rejected (AC-3) / the case is skipped
  at run time (AC-16). Never `eval`'d; only read as structured data.
- **`name` / `notes`** — stored/rendered as text, never as markup or a command.

## Cross-module impact
- **client → server**: `FindingCard` "Turn into eval case" → new `useCreateEvalFromFinding()` hook → new eval
  create endpoint; Evals tab / dashboard hooks (`client/src/lib/hooks/evals.ts`) → new eval read/run endpoints
  over `client/src/lib/api.ts`. Grounded in: repo map (client hooks call the API, never fetch server-side).
- **server evals module → reviews module**: reads a finding's accept/dismiss state + `file/lines` and the PR's
  diff to build a case. Read-only; no cross-module write. Grounded in: `modules/reviews/routes.ts` accept/dismiss
  routes + `diff-loader.ts`.
- **server evals module → agents repo**: reads `system_prompt`/`model`/`strategy`/`enabledSkillBodies`/`version`
  to run a case. Grounded in: `run-executor.ts` (same inputs a real review resolves).
- **server evals module → reviewer-core**: calls `reviewPullRequest` for each case and reuses `grounding.ts`
  line-overlap helpers in the pure `scoring` unit. `reviewer-core` stays frozen (pure; no new I/O). Grounded in:
  `reviewer-core/src/index.ts` public API.
- **New module** `server/src/modules/evals/` (`routes` → `service` → `repository` + a pure `scoring` unit),
  registered statically in `modules/index.ts`. Grounded in: `server/CLAUDE.md` module pattern + `blast` module.
- **Blast radius**: no existing symbol signatures change (new endpoints/contracts + three nullable `eval_runs`
  columns are additive); the `expected_output` contract **narrows** from `z.unknown()` to `EvalExpectation`,
  which could ripple to any current reader of `EvalCase` / `EvalCaseInput` — none found in app code beyond the
  starter contract. Grounded in: grep of `expected_output` consumers (only the contract + schema).

## Proposed improvements
- **Run-group modelled as columns on `eval_runs`** (`group_id` / `agent_version` / `system_prompt`), grouped on
  read — no separate `eval_run_groups` table. Decided (was NC-3): the starter `eval_runs` is per-case with no
  grouping; columns close that gap with the least schema surface.
- **Per-case `pass` and `traces_passed`/`traces_total`** so the "3/5 passing" list (mockup 3) is deterministic —
  see AC-17 and the Scoring & matching appendix. Decided (was NC-2).
- **Snapshot the agent's `system_prompt`** into the run-group columns so the compare modal's prompt-diff
  (mockup 5) is reproducible even after later edits. Decided (was NC-4): the compare endpoint returns both
  snapshots (AC-11).
- **Seed ≥8 demo cases** in `pnpm db:seed` so the ≥8-case AC and the dashboard are demoable out of the box.
  Status: open (nice-to-have; not a v1 requirement).
- **Global "Run all agents" trigger** on the global dashboard (mockup 6 button): a non-blocking nice-to-have; the
  required run trigger is the agent-scoped `POST /agents/:id/eval-runs`. Status: open (out of v1 scope).

## Scoring & matching (appendix — deterministic, zero LLM calls)
All scoring runs **in code** on `reviewPullRequest`'s returned output; **no** LLM call, embedding, or model
self-score enters scoring anywhere.

**Matching an expected finding to a produced finding.** An expected finding skeleton
`{ file, start_line, end_line, kind? }` matches a produced (grounded) finding when they have the **same `file`**
AND their `[start_line, end_line]` ranges **overlap**, reusing `reviewer-core/src/grounding.ts` `rangeIntersects`
semantics (`buildLineIndex` covers the produced side). Full-file kinds (`secret_leak` / `lethal_trifecta` /
`phantom` / `hook`) match on **file presence only** (no line range), mirroring the grounding full-file exemption.
Expected findings within a case are deduplicated by the key `(file, start_line, end_line)` before scoring.

**`must_find` case** — a listed expected finding is "found" when **≥1** produced finding matches it.
- `recall_case = (# expected findings matched) / (# expected findings)`.
- `precision_case = (# produced findings that match an expected finding) / (# produced findings)` — **STRICT**:
  any produced finding not matching an expected one lowers precision.

**`must_not_flag` case** — the forbidden listed finding must have **no** matching produced finding.
- No recall contribution (0 `must_find` expectations → the case is **excluded** from the recall average).
- Any produced finding matching the forbidden region is a false positive that lowers `precision_case`.

**Empty-denominator conventions.**
- `recall_case` is **undefined** when a case has 0 `must_find` expectations → that case is excluded from the
  recall average (a run with no `must_find` case reports `recall = 1`).
- `precision_case = 1.0` when a case produced **0** findings (vacuously no false positives).

**Run aggregate.**
- `recall = mean(recall_case over must_find cases)`.
- `precision = mean(precision_case over all cases)`.
- `citation_accuracy = total_kept / (total_kept + total_dropped)`, **pooled** across the run from each case's
  grounding result (`review.findings` kept + `dropped[]`); `= 1` when the run produced 0 raw findings.

**Per-case `pass`.**
- A `must_find` case passes IFF `recall_case == 1` **AND** `precision_case == 1` (all expected found, no false
  positive) — matches the mockup's "expected 1, got 1" pass and "expected 1, got 0" fail.
- A clean / `must_not_flag` case (0 `must_find` expectations, "expected 0 findings") passes IFF the forbidden
  finding is absent (equivalently `precision_case == 1`) — matches the mockup's "expected 0 findings, got 0" pass.
- `traces_passed` / `traces_total` = count of passing cases / total cases in the run.

## Notes
- **Spec deliverable path**: the submission checklist's "spec lives in `specs/`" is satisfied by the canonical
  `specs/cross/SPEC-05-2026-07-06-eval-pipeline.md` (SPEC-NN convention preserved). No thin `specs/eval-pipeline.md`
  pointer/copy is added — the canonical path is the single source of truth (decided; was NC-8).
- **`verify:l06` uses real recorded fixtures, not a mock provider** (decided; supersedes the earlier
  stubbed-`LLMProvider` framing of NC-5): the gate scores checked-in `ReviewOutcome` captures from actual agent
  runs (a good-prompt capture and a deliberately-broken-prompt capture) so it exercises the real scoring path and
  proves prompt-sensitivity deterministically — no mock, no API key, zero real LLM/network calls. Capturing the
  two fixtures is an implementation task (record once from a live run, redact any sensitive diff content, commit
  under the server test suite). See AC-9 / AC-15 and the "verify real functionality, not mocks" rationale.
