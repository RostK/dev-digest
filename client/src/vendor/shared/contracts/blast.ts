import { z } from 'zod';
import { BlastRadius } from './brief.js';

/**
 * Blast Radius HTTP response: the BlastRadius map plus the transport-level
 * degraded signal from the repo-intel facade.
 *
 * BlastRadius itself stays pure (it is also the Brief / LLM-output type), so
 * the degraded state rides alongside it here. This lets the Blast tab render a
 * "partial index" badge from the blast query's OWN result rather than guessing
 * from the repo-wide index state.
 */
export const BlastResponse = z.object({
  blast: BlastRadius,
  /** True when the facade ran on the ripgrep fallback (index incomplete). */
  degraded: z.boolean().optional(),
  /** Machine reason for degradation, e.g. "no_data" / "index_partial". */
  reason: z.string().nullish(),
  /** repo_index_state.status at query time: full | partial | degraded | failed. */
  index_status: z.string().nullish(),
});
export type BlastResponse = z.infer<typeof BlastResponse>;
