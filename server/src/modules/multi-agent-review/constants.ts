/**
 * Multi-Agent Review module tunables.
 */

/**
 * How many of an agent's most recent COMPLETED (`status='done'`) runs feed the
 * pre-run time·cost estimate (AC-5). Small and recent on purpose — a typical
 * duration/cost should track the agent's CURRENT model/prompt, not its whole
 * history (a stale estimate from a since-changed system prompt would mislead).
 */
export const AGENT_RUN_HISTORY_WINDOW = 5;
