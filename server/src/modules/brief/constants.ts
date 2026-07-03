/**
 * Brief module tunables: prompt caps for untrusted issue/spec text, and the
 * deterministic-fallback risk thresholds (mirrors blast/constants.ts style —
 * this module's model touch is the ONE `generateBrief` call; the fallback
 * below is zero-model and always available).
 */

/** Cap on the linked-issue body fed into the prompt (untrusted, wrapped). */
export const MAX_ISSUE_CHARS = 4_000;

/** Cap on EACH referenced spec/plan doc fed into the prompt (untrusted, wrapped). */
export const MAX_SPEC_CHARS = 4_000;

/**
 * Deterministic risk_level thresholds, applied to the blast map when no model
 * output is available (AC-8 fallback): callers OR impacted endpoints above the
 * HIGH threshold → 'high'; above MEDIUM → 'medium'; else 'low'.
 */
export const RISK_HIGH_CALLERS = 8;
export const RISK_HIGH_ENDPOINTS = 3;
export const RISK_MEDIUM_CALLERS = 2;
export const RISK_MEDIUM_ENDPOINTS = 1;
