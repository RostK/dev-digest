# INSIGHTS — reviewer-core (`@devdigest/reviewer-core`)

Durable engineering learnings for the pure review engine (diff → prompt → LLM →
findings), captured by the
[`engineering-insights`](../.claude/skills/engineering-insights/SKILL.md) skill.

**append-only** · one concrete, actionable-"cold" record per line · re-read before
adding (never duplicate) · skip the obvious.

Record format: `- YYYY-MM-DD — <actionable statement>. Evidence: path/file.ts:line.`

> Empty sections are intentional — they fill up only as real, non-obvious learnings
> surface. Don't pad them.

## What Works

## What Doesn't Work

## Codebase Patterns

- 2026-06-24 — Adding a DERIVED-context prompt slot (intent/scope) splits into two trust tiers: the slot VALUES go through `wrapUntrusted('intent', …)` as a `## PR intent` block (because `INJECTION_GUARD` already classifies "derived intent/scope" as untrusted DATA — prompt.ts:18), while the behavioural RULE ("focus in-scope; one signal finding for serious out-of-scope") is appended to the TRUSTED system string and must explicitly subordinate itself to the security guard ("never overrides … a real defect is always reported") so it can't be used to descope. Unlike skills/memory/specs, the `intent` slot was NOT pre-wired — it required adding `intent?: Intent` to `PromptParts` (prompt.ts) AND `ReviewInput` (review/run.ts promptParts pass-through) AND a barrel export. Always grep `PromptParts` before assuming a slot exists. Evidence: reviewer-core/src/prompt.ts (PromptParts.intent, SCOPE rule, intentSection), review/run.ts, intent/classify.ts, index.ts.
- 2026-06-24 — A second LLM pass that must stay token-lean (the intent classifier) is a SEPARATE pure function (`classifyIntent`) — NOT a flag on `reviewPullRequest`: it takes the injected `LLMProvider` + only file PATHS and hunk HEADERS (`@@ -a,b +c,d @@`), never diff bodies, and calls `completeStructured<Intent>` exactly like the review path (run.ts:174). Keeps purity (no I/O) and lets the server measure token savings (full-diff-chars/4 vs the classifier's tokensIn). Evidence: reviewer-core/src/intent/classify.ts.

## Decisions

## Tool & Library Notes

- 2026-06-16 — OpenRouter's `GET /api/v1/models` is PUBLIC: it returns the full model
  catalogue for ANY (even bogus/empty) key, so `listModels()` can NOT validate a key. To
  test a key, hit the authenticated `GET /api/v1/key` (see `verifyKey()`). Evidence:
  reviewer-core/src/llm/openrouter.ts (`listModels` vs `verifyKey`).
- 2026-06-16 — OpenRouter Provisioning keys (`GET /api/v1/key` → `is_provisioning_key:
  true`) manage other keys but CANNOT run inference → they 401 "User not found" on
  `/chat/completions`. Inference keys are `sk-or-v1-` + 64 hex (~73 chars); a ~181-char
  base64url token is a Provisioning key. Evidence: reviewer-core/src/llm/openrouter.ts
  (`verifyKey`).

## Recurring Errors & Fixes

## Session Notes

- 2026-06-24 — Built the Intent Layer engine half (L03): new pure `classifyIntent` (lightweight signals → `Intent`, no diff bodies) + a new `intent` prompt slot wired through `PromptParts`/`ReviewInput`/`assemblePrompt` (values untrusted-wrapped, scope rule in trusted system) + `assembly.intent` for the trace. Reviewed clean (architecture-reviewer: 0 violations; reviewer-core purity preserved). See Codebase Patterns.

## Open Questions
