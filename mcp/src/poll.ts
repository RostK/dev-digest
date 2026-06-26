/**
 * Polling helper for review runs.
 *
 * The DevDigest POST /pulls/:id/review endpoint is fire-and-forget (it returns
 * immediately with a run_id and an empty reviews array). `waitForRun` polls
 * GET /pulls/:id/runs until the run reaches a terminal status.
 *
 * Timeout is computed as max-iterations = ceil(timeoutMs / intervalMs) so
 * tests can pass tiny values (e.g. timeoutMs=1, intervalMs=10) and trigger
 * the timeout branch deterministically in a single iteration without sleeping.
 *
 * The `RunSummary` import is type-only: erased at runtime.
 */

import type { RunSummary } from '@devdigest/shared';
import type { ApiClient } from './api-client.js';
import { ForwardError } from './errors.js';

/** Minimal awaitable delay (injected by tests via tiny values). */
function sleep(ms: number): Promise<void> {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

/**
 * Poll `GET /pulls/:prId/runs` until `runId` reaches a terminal status.
 *
 * - `done`      → returns the RunSummary
 * - `failed`    → throws ForwardError with the run error + recovery hint
 * - `cancelled` → throws ForwardError with a retry hint
 * - timeout     → throws ForwardError directing the model to call get_findings
 *
 * @param client     The ApiClient port (never HttpApiClient directly).
 * @param prId       UUID of the pull request.
 * @param runId      The run to wait for.
 * @param opts.intervalMs  Milliseconds between polls.
 * @param opts.timeoutMs   Maximum total wait time in milliseconds.
 *                         When timeoutMs < intervalMs the timeout fires after
 *                         exactly one poll (maxAttempts = 1, no sleep).
 */
export async function waitForRun(
  client: ApiClient,
  prId: string,
  runId: string,
  opts: { intervalMs: number; timeoutMs: number },
): Promise<RunSummary> {
  const { intervalMs, timeoutMs } = opts;
  // Derive max attempts from the ratio so tests with tiny values work without
  // relying on wall-clock precision.
  const maxAttempts = Math.max(1, Math.ceil(timeoutMs / intervalMs));

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const runs = await client.listRuns(prId);
    const run = runs.find(r => r.run_id === runId);

    if (run) {
      if (run.status === 'done') {
        return run;
      }

      if (run.status === 'failed') {
        throw new ForwardError(
          `review run ${runId} failed: ${run.error ?? 'unknown error'}. ` +
            `Check the agent's provider API key in DevDigest Settings, then retry run_agent_on_pull_request.`,
        );
      }

      if (run.status === 'cancelled') {
        throw new ForwardError(
          `review run ${runId} was cancelled — retry run_agent_on_pull_request.`,
        );
      }
    }

    // Run is still running (or not yet visible in the list) — sleep before
    // the next attempt, unless this is the last allowed attempt.
    if (attempt < maxAttempts - 1) {
      await sleep(intervalMs);
    }
  }

  throw new ForwardError(
    `review run ${runId} still running after ${timeoutMs / 1000}s (large diff?) — ` +
      `call get_findings shortly to fetch the result.`,
  );
}
