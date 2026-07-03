/**
 * Brief module tunables: prompt caps for untrusted issue/spec text, and the
 * deterministic-fallback risk thresholds (mirrors blast/constants.ts style —
 * this module's model touch is the ONE `generateBrief` call; the fallback
 * below is zero-model and always available).
 */

/** Cap on the linked-issue body fed into the prompt (untrusted, wrapped). */
export const MAX_ISSUE_CHARS = 4_000;

/**
 * Cap on EACH referenced spec/plan doc fed into the prompt (untrusted, wrapped).
 * Renamed (from `MAX_SPEC_CHARS`) to avoid colliding with `_shared/pr-body-refs.ts`'s
 * own `MAX_SPEC_CHARS` (8_000, the intent-service cap) — the two are DIFFERENT
 * caps for different callers. This cap is applied ONCE, at the `loadSpecDocs`
 * call site in `brief/service.ts` (passed as its `maxChars` argument); do not
 * re-truncate downstream in `helpers.ts`.
 */
export const MAX_SPEC_CHARS_BRIEF = 4_000;

/**
 * Deterministic risk_level thresholds, applied to the blast map when no model
 * output is available (AC-8 fallback): callers OR impacted endpoints above the
 * HIGH threshold → 'high'; above MEDIUM → 'medium'; else 'low'.
 */
export const RISK_HIGH_CALLERS = 8;
export const RISK_HIGH_ENDPOINTS = 3;
export const RISK_MEDIUM_CALLERS = 2;
export const RISK_MEDIUM_ENDPOINTS = 1;
