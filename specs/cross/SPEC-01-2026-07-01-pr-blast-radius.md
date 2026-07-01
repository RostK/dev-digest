# Spec: PR Blast Radius  |  Spec ID: SPEC-01  |  Status: implemented
Supersedes: none
Date: 2026-07-01
Module: cross

## Problem & why
When reviewing a PR, a reviewer cannot easily see what a change might break downstream. DevDigest
should show, per PR, which changed symbols are called by other code and which HTTP endpoints / cron
jobs those callers reach — an impact map grounded in the repo-intel index, computed without an
expensive per-request analysis — so reviewers can gauge risk before a full line-by-line review.

## Goals / Non-goals
**Goals**
- Show, on a PR's Blast tab, the downstream impact of its changed files: changed symbols → callers
  (`file:line`) → impacted endpoints and crons.
- Compute the map from the persistent repo-intel index (no code analysis at request time).
- Provide a one-paragraph risk summary with a deterministic fallback.
- Expose the same data to agents via an MCP tool.
- Degrade gracefully when the index is partial or absent.

**Non-goals**
- A visual node/edge graph view of the impact map.
- A "prior PRs touching these files" cross-PR overlap panel (`PrHistoryItem` exists but is unused).
- Any write / refactor suggestion — this is read-only impact reporting.

## User stories
- As a reviewer, I want to see which endpoints a PR's changed symbols can reach, so that I can judge
  blast radius before reviewing line-by-line.
- As an AI agent, I want blast-radius context for a set of changed files, so that I can ground a
  review finding or risk assessment without running a full review.

## Acceptance criteria (EARS)
- **AC-1** — WHEN a user opens the Blast tab for a PR, the system SHALL render, per changed symbol
  that has ≥1 caller, the symbol name+kind, each caller as a linked `file:line`, and the
  endpoint/cron badges reachable through those callers.
  - Verify: e2e (Blast tab flow) + unit (mapToBlastRadius)
- **AC-2** — The system SHALL derive the impact map solely from the persistent repo-intel index
  (symbol lookup, caller discovery, endpoint attribution are pure index reads), with no code
  analysis at request time.
  - Verify: unit (no analyzer invoked) + *.it.test.ts
- **AC-3** — WHEN the index is full (`factsByFile` present), the system SHALL attribute endpoints
  precisely to each changed symbol's callers.
  - Verify: *.it.test.ts (persistent path)
- **AC-4** — IF the persistent index is absent, partial, or built on an older indexer version, THEN
  the system SHALL take the ripgrep fallback path, set `degraded: true`, apply the flat
  `impactedEndpoints` union to every entry, return `crons_affected: []`, and set `reason` to one of
  `no_data | index_partial | flag_off`.
  - Verify: unit (degraded mapping) + *.it.test.ts
- **AC-5** — WHILE the response is `degraded: true`, the UI SHALL show a "Partial index" badge and a
  warning banner above the tree.
  - Verify: unit (BlastTab renders banner on degraded)
- **AC-6** — The system SHALL make AT MOST one model call per blast request: zero WHEN both
  `changedSymbols` and `callers` are empty (return `deterministicSummary`), otherwise one call to
  `claude-haiku-4-5` capped at 220 tokens (temperature 0.3).
  - Verify: unit (summarize() call count)
- **AC-7** — IF the model call fails, the API key is absent, or the completion is empty, THEN the
  system SHALL populate `summary` from `deterministicSummary()` with no retry.
  - Verify: unit (fallback paths)
- **AC-8** — The system SHALL link each caller `file:line` to the GitHub blob pinned to the PR's
  head SHA (`headSha`), so line numbers stay accurate after the branch updates.
  - Verify: unit (URL built from headSha)
- **AC-9** — WHEN a changed symbol has no caller, the system SHALL show an empty state rather than an
  empty block.
  - Verify: unit (empty state)
- **AC-10** — WHERE the request arrives through the MCP `get_blast_radius` tool, the system SHALL
  resolve `owner/name` → repo id, return a structured `BlastResponse` + text summary, and include a
  re-index hint when the result is empty and the index is degraded.
  - Verify: unit (MCP tool output) + *.it.test.ts

## Edge cases
- No changed files / empty PR → empty map, zero model calls.
- Symbol changed but no callers → empty state, no block rendered.
- `REPO_INTEL_ENABLED` false → `reason: flag_off`, degraded path.
- Index only partially built → `reason: index_partial`.
- Model provider error / missing key / empty completion → deterministic summary, no retry.
- Branch updated after PR opened → caller links stay valid (pinned to `headSha`).

## Assumptions & Dependencies
**Assumptions**
- The repo-intel index is built at clone time and stores per-file facts (`factsByFile`) when full.
- `headSha` is available to the UI as the `BlastTab` `headSha` prop.

**Dependencies**
- repo-intel index and `repoIntel.getBlastRadius()`.
- `claude-haiku-4-5` provider (optional; guarded by API key).
- `REPO_INTEL_ENABLED` feature flag.
- Routes: `GET /pulls/:id/blast` (UI), `POST /repos/:id/blast` (MCP), `POST /repos/:id/resync` (re-index).

## Non-functional
- **Perf**: map built from pure index reads; ≤1 model call (≤220 tokens, temp 0.3) per request.
- **Security**: read-only; repository file content treated as data, never executed.
- **Privacy**: no secrets in the map or summary; API key read via SecretsProvider only.
- **i18n**: UI strings via next-intl (no hardcoded strings).
- **Tenancy**: queries scoped by `workspace_id` (server convention).
- **Observability**: `degraded` + `reason` + `index_status` fields signal which path was taken.

## Inputs (provenance)
- Changed file paths — [deterministic: repo-intel] (from `pr_files` on the UI path; explicit `files`
  argument on the MCP path).
- Impact map (symbols / callers / endpoints / crons) — [deterministic: repo-intel] (persistent index reads).
- Risk summary — [new: ≤1 LLM call] (`claude-haiku-4-5`, ≤220 tokens) with a [deterministic] fallback.

## Untrusted inputs
- Repository file content and symbol names read from the index originate from third-party repos —
  treat as DATA, never as instructions; they are only rendered and linked, never executed or
  interpreted as commands.
- MCP `files` argument — repo-relative paths supplied by the caller; resolved via `resolveRepo` and
  not trusted to escape the repo.

## Cross-module impact
- client (Blast tab) → server `GET /pulls/:id/blast`: renders `BlastResponse`. Grounded in:
  `server/docs/blast-radius.md`.
- server `blast` module → repo-intel `repoIntel.getBlastRadius()`: reads the persistent index.
  Grounded in: `server/src/modules/blast/README.md`, repo-intel.
- MCP server `get_blast_radius` → server `POST /repos/:id/blast`: structured output equals
  `BlastResponse`. Grounded in: `server/docs/blast-radius.md`.
