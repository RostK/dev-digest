import { Onboarding, type OnboardingJobStatus, type OnboardingResponse } from '@devdigest/shared';
import type { IndexState } from '../repo-intel/types.js';
import type { JobRow, OnboardingRow } from './repository.js';

/**
 * Row → contract mapping for the onboarding envelope. No I/O, no DB — pure
 * transforms only (mirrors conventions/helpers.ts `toConventionDto`).
 */

export function toJobStatus(row: JobRow): OnboardingJobStatus {
  return {
    job_id: row.id,
    status: row.status,
    error: row.error ?? null,
  };
}

/**
 * "Stale" (AC-22): the index moved on past the tour's `generated_at`. No
 * tour yet → never stale (that's the empty state, not a staleness badge).
 */
export function isStale(state: IndexState, generatedAt: Date | null): boolean {
  if (!generatedAt) return false;
  return state.updatedAt.getTime() > generatedAt.getTime();
}

/**
 * Compose the ONE response envelope the tour screen reads from: the tour
 * itself (nullable — never a 404), freshness (`files_indexed`/`indexed`/
 * `stale`), and the latest onboarding job (any status, so a failure is
 * visible too, not just an in-flight run).
 */
export function toOnboardingResponse(
  row: OnboardingRow | undefined,
  state: IndexState,
  jobRow: JobRow | undefined,
): OnboardingResponse {
  // Defensive: the row is only ever written by this module's own upsertTour,
  // so a parse failure would mean row corruption — treat as "no tour" rather
  // than 500ing the whole envelope.
  const parsed = row ? Onboarding.safeParse(row.json) : undefined;
  const tour = parsed?.success ? parsed.data : null;
  const generatedAt = row ? row.generatedAt : null;

  return {
    tour,
    generated_at: generatedAt ? generatedAt.toISOString() : null,
    files_indexed: state.filesIndexed,
    indexed: state.filesIndexed > 0,
    stale: isStale(state, generatedAt),
    job: jobRow ? toJobStatus(jobRow) : null,
  };
}
