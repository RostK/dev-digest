/**
 * SPEC-05 T3 — eval module constants.
 */

/** Review strategy forced for eval runs — always the whole (small) case diff in
 *  one call, independent of the agent's own configured strategy, so a case's
 *  score is comparable across runs regardless of live agent-config drift in
 *  anything BUT the snapshot fields runSet captures (system_prompt/version). */
export const EVAL_REVIEW_STRATEGY = 'single-pass' as const;
