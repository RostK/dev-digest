/**
 * SPEC-05 T3 — eval module constants.
 */

/** Review strategy forced for eval runs — always the whole (small) case diff in
 *  one call, independent of the agent's own configured strategy, so a case's
 *  score is comparable across runs regardless of live agent-config drift in
 *  anything BUT the snapshot fields runSet captures (system_prompt/version). */
export const EVAL_REVIEW_STRATEGY = 'single-pass' as const;

/** Max eval cases whose review pass runs CONCURRENTLY within one `runSet`. Bounds
 *  the real-LLM fan-out: a large case set no longer runs strictly sequentially
 *  (slow — one ~15s review at a time) but also never unboundedly (provider rate
 *  limits / overload). Each case is still independent; only the wall-clock changes. */
export const EVAL_RUN_CONCURRENCY = 4;

/** T4 — how many of the most recent run-groups feed the dashboard trend line. */
export const DASHBOARD_TREND_LIMIT = 10;

/** T4 — how many of the most recent individual eval_runs rows feed the
 *  dashboard's `recent_runs` list. */
export const DASHBOARD_RECENT_RUNS_LIMIT = 10;

/**
 * T4 — dashboard `alert` thresholds: a metric that DROPS by more than this
 * fraction vs the prior run-group surfaces a plain-language warning banner.
 * Recall and precision are treated as equally alert-worthy (both drive
 * agent trust); citation_accuracy is intentionally excluded — a low
 * grounding rate is already visible as a metric card, not a regression
 * signal vs a good prior run.
 */
export const DASHBOARD_ALERT_DROP_THRESHOLD = 0.1;
