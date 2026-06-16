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

## Open Questions
