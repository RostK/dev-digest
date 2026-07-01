/**
 * Blast module tunables. The map itself is built by the repo-intel facade
 * (pure index reads, no model). The ONLY model touch in this feature is the
 * one-paragraph summary below — and it always has a deterministic fallback.
 */

/**
 * Default model for the optional one-paragraph summary. Deliberately the
 * cheapest current Claude (Haiku 4.5) — a single short, low-stakes completion
 * over an already-computed map. Anthropic so it reuses the ANTHROPIC_API_KEY.
 */
export const BLAST_SUMMARY_DEFAULT_MODEL = {
  provider: 'anthropic',
  model: 'claude-haiku-4-5',
} as const satisfies { provider: 'openai' | 'anthropic' | 'openrouter'; model: string };

/** Token ceiling for the summary completion — one short paragraph. */
export const BLAST_SUMMARY_MAX_TOKENS = 220;
