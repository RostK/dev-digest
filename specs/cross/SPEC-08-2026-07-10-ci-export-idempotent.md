# Spec: Idempotent Export to CI  |  Spec ID: SPEC-08  |  Status: approved
Supersedes: none
Date: 2026-07-10
Module: cross

<!-- Relationship: this AMENDS/EXTENDS SPEC-07 (Export to CI,
     specs/cross/SPEC-07-2026-07-08-export-to-ci.md, approved) — it adds a missing behavior
     (idempotent reconciliation of the committed bundle) and does NOT supersede it. SPEC-07 stays
     approved; every SPEC-07 acceptance criterion continues to hold (see AC-6). -->

## Problem & why
Export-to-CI (SPEC-07) commits an agent's bundle to a `devdigest/ci` branch by layering a new git tree
on the **existing branch head's** tree (`octokit.ts:288-300`, `base_tree = parentCommit.tree.sha`,
"so unrelated files are kept") and only writes the bundle's own paths — the adapter has **no delete
capability**. Because each agent's manifest is written to a **per-agent** path
`.devdigest/agents/<agent-slug>.yaml` (`service.ts:266`), exporting a *second, different* agent to a
repo that already has one **accumulates** manifests on the branch (e.g. `general-reviewer.yaml` +
`performance-reviewer.yaml`) instead of replacing the prior one. The CI runner requires **exactly one**
`*.yaml` in `.devdigest/agents/` (v1 = single agent per repo) and throws
`RunnerError("Expected exactly one agent manifest ... found N")` otherwise, so CI exits 1. This is not
hypothetical: `RostK/dev-digest` PR #22 (branch `devdigest/ci`) carries both manifests and its
"DevDigest review" job failed with exactly that error. Export must be **idempotent**: after an export,
the `.devdigest/` CI bundle on the branch must reflect **exactly the current export** — no stale files
left behind from a prior export of a different agent.

The chosen mechanism is **reset-to-base**: each export force-updates the `devdigest/ci` branch so its
tree equals the **base branch's** tree plus **exactly the current export's** bundle files. This
self-heals any repo already in the broken state (any prior export's manifest/skills/runner files that
lived only on `devdigest/ci` are gone), needs **no delete capability** on `CommitFilesPayload`, and
makes the resulting branch state a pure function of the current agent + base — independent of prior
export history. The accepted trade-off: the `devdigest/ci` branch is treated as **export-owned**, so an
export does **not** preserve unrelated files a user may have committed directly to that branch (see
Non-goals + Assumptions).

## Goals / Non-goals
**Goals**
- Make the "Open a PR" export path **idempotent** at the manifest level: after an export, the
  `devdigest/ci` branch's `.devdigest/agents/` directory contains **exactly one** manifest — the
  current agent's `<slug>.yaml` — with no stale manifest from a prior export of a different agent.
- **Self-heal** a repo that is already in the broken two-manifest state (like PR #22): the next export
  resets `devdigest/ci` to `base` + the current bundle, so it reconciles down to the single current
  manifest with no stale files remaining.
- Preserve the clean-update behavior for re-exporting the **same** agent (no duplication — already true).
- Preserve every SPEC-07 export behavior and security invariant unchanged (workflow, runner files,
  `memory.jsonl`, single reused PR on `devdigest/ci`, no LLM call, provider forced `openrouter`, no
  secrets committed, actionable 422 on token-permission failure, `action:'files'` zip path, non-`gha`
  no-op).

**Non-goals**   <!-- explicit boundaries — v1 is a correctness fix, not a feature -->
- **Supporting more than one active DevDigest agent per repo.** The runner's one-manifest invariant is a
  given integration boundary; v1 keeps "one active agent per repo" and does not add multi-manifest
  runner support.
- **Preserving unrelated files a user committed directly to the `devdigest/ci` branch.** Reset-to-base
  treats that branch as **export-owned**: each export force-updates it to `base` + the current bundle, so
  any file previously committed to `devdigest/ci` that is not part of the current bundle is dropped. This
  is the explicit, accepted trade-off of the reset mechanism (AC-7).
- **Targeted / per-skill reconciliation of `.devdigest/skills/*.md`.** v1 adds **no** separate skill-file
  reconciliation logic (no enumeration or per-skill deletion). Stale skills from a prior export are
  already absent because reset-to-base rebuilds the whole bundle from base each export — so the bundle
  always reflects exactly the current export (AC-7) with no dedicated skill mechanism.
- **Reconciling / deactivating a superseded agent's `ci_installations` record.** When a different agent
  is exported to a repo another agent already installed, the export just upserts the new agent's row (as
  in SPEC-07); the prior `(agent_id, repo)` row is left in place. The old agent's CI tab may still show an
  installation for that repo — a cosmetic inconsistency accepted for v1 (see Proposed improvements).
- **Changing the `.devdigest/agents/<slug>.yaml` per-agent path scheme, the branch name (`devdigest/ci`),
  the PR reuse flow, the workflow generation, Sync/ingest, or any UI.** This is a server-side
  correctness fix in the export/commit path only.
- **Retroactively rewriting already-merged history.** The fix self-heals on the **next** export; it does
  not touch past commits or already-merged config.
- **Disambiguating two agents whose names kebab-case to the same slug** (a pre-existing SPEC-07 Proposed
  improvement) — unchanged and still out of scope.
- **Adding a DB migration or a `(agent_id, repo)` DB constraint** — the CI tables ship as-is (SPEC-07
  do-not-touch discipline).

## User stories
- As an agent author who has already exported one agent to a repo, I want to export a **different** agent
  to that same repo and have CI keep working, so that the runner does not fail with "expected exactly one
  manifest".
- As a maintainer whose `devdigest/ci` PR is already stuck with two manifests, I want the next DevDigest
  export to clean it up automatically, so that I don't have to hand-delete files to unbreak CI.
- As an agent author re-exporting the **same** agent, I want the update to stay a clean single-manifest
  update, so that nothing duplicates.

## Acceptance criteria (EARS)
<!-- NEW criteria for SPEC-08. AC-2/AC-9/etc. referenced with a "SPEC-07 " prefix are the prior spec's. -->
- **AC-1** — WHEN the user Installs with "Open a PR" (`action:'open_pr'`) for an agent to a repo whose
  `devdigest/ci` branch already carries a DevDigest CI bundle from a **prior export of a different
  agent**, THEN after the commit the branch's `.devdigest/agents/` SHALL contain **exactly one** manifest
  — the current agent's `<slug>.yaml` — and no stale manifest from the prior agent SHALL remain.
  - Verify: `*.it.test.ts` — export agent A (slug `a.yaml`) to a repo, then export agent B (slug
    `b.yaml`); assert `.devdigest/agents/` on `devdigest/ci` contains only `b.yaml` and not `a.yaml`.
- **AC-2** — WHEN the **same** agent is re-exported to the same repo, THEN the branch's
  `.devdigest/agents/` SHALL still contain exactly that agent's single `<slug>.yaml` (clean update, no
  duplication and no additional manifest).
  - Verify: `*.it.test.ts` — export agent A twice; assert exactly one `a.yaml` and no other manifest.
- **AC-3** — WHERE the `devdigest/ci` branch is already in the broken multi-manifest state (two or more
  `.devdigest/agents/*.yaml`, as in PR #22), the next "Open a PR" export SHALL reconcile it so that only
  the current agent's `<slug>.yaml` remains afterward (self-heal).
  - Verify: `*.it.test.ts` — seed the branch with two manifests, export agent B, assert only `b.yaml`
    remains.
- **AC-4** — The idempotency fix SHALL continue to write the runner files under `.devdigest/runner/`, the
  workflow at `.github/workflows/devdigest-review.yml`, and the empty `.devdigest/memory.jsonl` on every
  export, and SHALL continue to open — or reuse via `findOpenPr` — a **single** PR on the `devdigest/ci`
  branch (no second PR, no branch-name change).
  - Verify: `*.it.test.ts` — the committed file set still includes runner + workflow + `memory.jsonl`; a
    second export reuses the existing PR (one PR total).
- **AC-5** — WHERE the user chooses "Copy files as a zip" (`action:'files'`), the returned bundle SHALL
  be unchanged from SPEC-07 (a freshly assembled bundle, inherently reflecting only the current agent);
  the idempotency fix SHALL NOT alter the zip path.
  - Verify: `*.it.test.ts` — `action='files'` returns the current bundle only; `commitFiles` not called;
    no branch/PR side effect.
- **AC-6** — The fix SHALL preserve the SPEC-07 export invariants without regression: no LLM call in the
  export path; `provider:'openrouter'` and the agent's `model` verbatim (SPEC-07 AC-2); no API
  key/secret in any committed bundle file (SPEC-07 AC-2/AC-9); a token-permission failure surfaces as an
  actionable `ValidationError` (422), not a 500; and a non-`gha` target performs no functional export
  (SPEC-07 AC-20).
  - Verify: unit + `*.it.test.ts` — regression assertions mapped to SPEC-07 AC-2/AC-9/AC-13/AC-20; no
    `container.llm` call in the export path.
- **AC-7** — WHEN an agent is exported with "Open a PR" (`action:'open_pr'`), THEN the export SHALL
  force-update the `devdigest/ci` branch so its tree equals the **base** branch's tree plus **exactly**
  the current export's bundle files, such that afterward `.devdigest/agents/` contains exactly one
  manifest — the current agent's `<slug>.yaml` — and **no** file from any prior export (a prior agent's
  manifest, its `.devdigest/skills/*.md`, or any other bundle file present only on `devdigest/ci`)
  remains. As an accepted consequence, an unrelated file previously committed **only** to `devdigest/ci`
  and not part of the current bundle SHALL also be absent afterward (branch is export-owned).
  - Verify: `*.it.test.ts` — seed `devdigest/ci` with a prior agent's `a.yaml`, a stale
    `.devdigest/skills/s1.md`, and an unrelated `notes.txt`; export agent B; assert the branch tree =
    base + current bundle (only `b.yaml` under `.devdigest/agents/`, no `s1.md`, no `notes.txt`), and the
    commit parents on `base` rather than the prior branch head.

## Edge cases
- **Repo already broken (two manifests, PR #22)** → next export self-heals to a single current manifest
  (AC-3). This is the observed production failure.
- **Same-agent re-export** → the branch already has only the current `<slug>.yaml`; export leaves exactly
  that one, no duplication (AC-2).
- **Agent with no enabled skills** → the current bundle has no `.devdigest/skills/*.md`; any stale skill
  files from a prior export are already absent because reset-to-base rebuilds the tree from `base` +
  current bundle (AC-7) — no dedicated per-skill reconciliation is performed.
- **"Copy files as a zip" path** → the bundle is assembled fresh, so it inherently reflects only the
  current agent; nothing to reconcile (AC-5). The accumulation bug is unique to the branch-layering
  commit path.
- **Unrelated files a user manually committed to `devdigest/ci`** → dropped: reset-to-base treats the
  branch as export-owned and rebuilds it from `base` + current bundle each export (AC-7, Non-goal).
- **Two different agents kebab-casing to the same slug in one repo** → pre-existing SPEC-07 Proposed
  improvement (disambiguate); NOT resolved here — with a single shared slug the second export overwrites
  the first in place regardless.
- **Reconcile enumerates a branch that is empty / freshly created** → nothing stale to remove; export
  behaves exactly as SPEC-07's first-export path.
- **Concurrent exports to the same repo** → out of scope for v1 (single-user localhost studio); last
  export wins, consistent with SPEC-07's force-update ref behavior.

## Assumptions & Dependencies
**Assumptions**
- **The runner's one-manifest invariant is a fixed integration boundary** (given `agent-runner` infra,
  absent on this tree per SPEC-07): `resolveManifestPath` requires exactly one `*.yaml` under
  `.devdigest/agents/` and throws `RunnerError("Expected exactly one agent manifest ... found N")`
  otherwise. v1 = single active agent per repo. This spec makes the **export** honor that invariant; it
  does not modify the runner.
- **The per-agent manifest path scheme (`.devdigest/agents/<slug>.yaml`) is retained** — the fix resets
  the branch to `base` + current bundle rather than switching to a single fixed filename. Reset makes
  export idempotent without any delete capability on the contract.
- **The `devdigest/ci` branch is export-owned** — reset-to-base rebuilds its tree from `base` each export,
  so nothing a user commits directly to that branch survives an export. This is the accepted trade-off of
  the reset mechanism (AC-7, Non-goal).
- **The GitHub adapter and its `commitFiles`/`findOpenPr`/`openPullRequest` primitives are otherwise
  correct** — the only gap is that `commitFiles` parents the new tree on the existing branch head; reset
  requires parenting/basing the tree on the **base** branch instead (no new delete primitive needed).
- **The bundle assembled by `buildBundle` already reflects only the current agent** — the bug is purely
  in how the commit layers onto the existing branch tree, not in bundle assembly.

**Dependencies**
- SPEC-07 (Export to CI) — this amends it; all SPEC-07 ACs continue to hold (AC-6).
- `server/src/modules/ci/service.ts` (`CiService.install()` / `buildBundle`) — the export/commit path.
- `server/src/adapters/github/octokit.ts` (`commitFiles`) — the tree/commit/ref logic that must base the
  new tree/commit on the **base** branch (`base_tree` = base branch tree, parent = base head) rather than
  on the existing `devdigest/ci` head, so the branch is reset to `base` + current bundle.
- `server/src/vendor/shared/adapters.ts` — `CommitFilesPayload` / `CommitFile` contract. **Reset-to-base
  needs no delete capability**, so no contract extension is required (v1 avoids a dual-vendored change);
  if a `base`/reset flag is threaded through the payload it stays additive.
- `server/src/adapters/mocks.ts` (`commitFiles` mock, ~L224) — must model reset-to-base (tree = base +
  supplied files) so `.it`/unit tests can assert the resulting branch file set.
- The given `agent-runner/` package's one-manifest invariant — the reason the fix is required (not
  modified here).

## Non-functional   <!-- only where relevant -->
- **Security**: unchanged from SPEC-07 and load-bearing — no secret/key in any committed bundle file, key
  only via Actions Secrets, least-privilege workflow permissions, `pull_request` (not
  `pull_request_target`), reviewed PR to `devdigest/ci` never a direct push to base. The reset-to-base
  force-update MUST target the `devdigest/ci` ref only and MUST NOT commit anything to the base branch.
  (AC-6.)
- **Correctness**: the export is the acceptance surface — the resulting branch state must be a pure
  function of the current agent + `base`, independent of prior export history (idempotent).
- **Perf**: reset-to-base stays a bounded GitHub REST sequence (read the base tree + build the
  tree/commit and force-update the ref) — **no LLM call** in the export path (SPEC-07 perf NFR preserved).
- **Privacy**: `.devdigest/memory.jsonl` remains empty; no new content is committed.
- **Tenancy**: unchanged — export resolves the agent within the caller's `workspace_id` first
  (SPEC-07); this fix adds no new cross-workspace surface.

## Inputs (provenance)
- Agent config + enabled skills → the current bundle — [reused] from SPEC-07's `buildBundle` (unchanged).
- **The base branch's tree** (`base`, e.g. `main`) — [new: read from GitHub] the trusted foundation the
  reset layers the current bundle onto. The existing `devdigest/ci` branch contents are **not** read or
  reconciled against — reset-to-base discards them by basing on `base`.
- Export options (`repo`, `action`, `base`, …) — [reused] `CiExportInput` (unchanged).

## Untrusted inputs
- **The existing `devdigest/ci` branch contents and any prior-committed files** — effectively untrusted
  state. Reset-to-base does **not** read, enumerate, or trust them: the new tree is built from the `base`
  branch tree + the freshly assembled current bundle, and the branch ref is force-updated to that commit.
  Any stray file on `devdigest/ci` is therefore discarded, and no branch content can redirect writes off
  the branch (e.g. into `base` or outside `.devdigest/` / the workflow path). The reset MUST target the
  `devdigest/ci` ref only and never push to `base`.

## Cross-module impact
- server `modules/ci` (service) → `adapters/github/octokit` (`commitFiles`): the commit must reset the
  branch to `base` + the current bundle (parent/`base_tree` on the base branch) rather than layering new
  paths onto the existing head. Grounded in `octokit.ts:288-300` (base_tree = existing head) and
  `service.ts:83`.
- `adapters/github/octokit` → shared `CommitFilesPayload` (`vendor/shared/adapters.ts:134`): reset-to-base
  parents on `base` instead of the branch head and needs **no** delete field, so no contract change is
  forced. Should a `base`/reset flag be threaded through the payload, it is additive and **dual-vendored**
  to the client copy (memory: shared contracts are dual-vendored, edit both).
- `adapters/mocks.ts` (`commitFiles` mock ~L224): must model reset-to-base (resulting tree = base +
  supplied files) so tests can assert the resulting branch file set.
- runner boundary: the exported `.devdigest/agents/` must satisfy the given `agent-runner`'s exactly-one-
  manifest invariant — the entire reason for the fix. The interface (YAML manifest under
  `.devdigest/agents/`) is unchanged; only its cardinality on the branch is corrected.
- Blast radius **not computed during authoring** (local DevDigest MCP/API unavailable, consistent with
  SPEC-01..07). Highest-fan-in touch point: `CiService.install` + the extended/adjusted `commitFiles`.

## Proposed improvements
These are **non-blocking recommendations** for the plan phase — NOT requirements, and MUST NOT be treated
as acceptance criteria.
- **Reconcile `ci_installations` when a repo's active agent changes** (deferred from v1) —
  v1 leaves the superseded agent's `(agent_id, repo)` row in place, so the old agent's CI tab may still
  show an installation for a repo CI no longer runs it on (cosmetic). A future iteration should
  mark/remove the superseded installation row so the studio reflects the single active agent per repo. —
  Status: open (accepted cosmetic gap for v1).
- **Warn in the wizard when a repo already has a different DevDigest agent installed** — surface, before
  committing, that "Open a PR" will replace the other agent's CI config, so replacement is a conscious
  choice, not a surprise. — Status: open.
- **A single fixed manifest filename (e.g. `.devdigest/agents/agent.yaml`)** — an alternative that would
  also make export idempotent, at the cost of the per-agent-slug naming; v1 chose reset-to-base instead
  (keeps the slug scheme, needs no delete capability). — Status: open.
