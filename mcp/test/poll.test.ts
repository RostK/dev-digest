/**
 * Tests for poll.ts — waitForRun.
 *
 * Uses a plain fake ApiClient (no fetch, no HttpApiClient).
 * Verifies the four terminal branches (done / failed / cancelled / timeout)
 * and correct run_id selection among multiple rows.
 *
 * All opts use tiny intervalMs/timeoutMs values so tests complete in < 50 ms.
 */

import { describe, it, expect } from 'vitest';
import { waitForRun } from '../src/poll.js';
import { ForwardError } from '../src/errors.js';
import type { ApiClient } from '../src/api-client.js';
import type { RunSummary } from '@devdigest/shared';

// ---------------------------------------------------------------------------
// Fake-client builder
// ---------------------------------------------------------------------------

function makeClient(overrides: Partial<ApiClient>): ApiClient {
  return {
    listAgents: async () => [],
    listRepos: async () => [],
    listPulls: async () => [],
    runReview: async () => ({ pr_id: '', runs: [], reviews: [] }),
    listRuns: async () => [],
    listReviews: async () => [],
    listConventions: async () => [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// RunSummary fixture factory
// ---------------------------------------------------------------------------

function makeRun(
  status: string,
  runId = 'run-1',
  error: string | null = null,
): RunSummary {
  return {
    run_id: runId,
    agent_id: 'agent-1',
    agent_name: 'Test Agent',
    provider: 'openai',
    model: 'gpt-4',
    status,
    error,
    duration_ms: null,
    tokens_in: null,
    tokens_out: null,
    cost_usd: null,
    findings_count: null,
    grounding: null,
    ran_at: null,
    score: null,
    blockers: null,
  };
}

// ---------------------------------------------------------------------------
// done branch
// ---------------------------------------------------------------------------

describe('waitForRun — done', () => {
  it('returns the RunSummary immediately when status is "done"', async () => {
    const client = makeClient({
      listRuns: async () => [makeRun('done')],
    });

    const result = await waitForRun(client, 'pr-1', 'run-1', {
      intervalMs: 10,
      timeoutMs: 100,
    });

    expect(result.run_id).toBe('run-1');
    expect(result.status).toBe('done');
  });

  it('returns the run after initially being in "running" state', async () => {
    let callCount = 0;
    const client = makeClient({
      listRuns: async () => {
        callCount++;
        return callCount === 1 ? [makeRun('running')] : [makeRun('done')];
      },
    });

    const result = await waitForRun(client, 'pr-1', 'run-1', {
      intervalMs: 1,
      timeoutMs: 100,
    });

    expect(result.status).toBe('done');
    // Must have polled at least twice
    expect(callCount).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// failed branch
// ---------------------------------------------------------------------------

describe('waitForRun — failed', () => {
  it('throws ForwardError with the run error when status is "failed"', async () => {
    const client = makeClient({
      listRuns: async () => [
        makeRun('failed', 'run-1', 'OPENAI_API_KEY is not set'),
      ],
    });

    const err = await waitForRun(client, 'pr-1', 'run-1', {
      intervalMs: 10,
      timeoutMs: 100,
    }).catch(e => e);

    expect(err).toBeInstanceOf(ForwardError);
    const msg: string = (err as ForwardError).message;
    expect(msg).toContain('run-1');
    expect(msg).toContain('OPENAI_API_KEY is not set');
    expect(msg).toContain('Settings');
    expect(msg).toContain('run_agent_on_pull_request');
  });

  it('uses "unknown error" when the run error field is null', async () => {
    const client = makeClient({
      listRuns: async () => [makeRun('failed', 'run-1', null)],
    });

    const err = await waitForRun(client, 'pr-1', 'run-1', {
      intervalMs: 10,
      timeoutMs: 100,
    }).catch(e => e);

    expect(err).toBeInstanceOf(ForwardError);
    expect((err as ForwardError).message).toContain('unknown error');
  });
});

// ---------------------------------------------------------------------------
// cancelled branch
// ---------------------------------------------------------------------------

describe('waitForRun — cancelled', () => {
  it('throws ForwardError with a retry hint when status is "cancelled"', async () => {
    const client = makeClient({
      listRuns: async () => [makeRun('cancelled')],
    });

    const err = await waitForRun(client, 'pr-1', 'run-1', {
      intervalMs: 10,
      timeoutMs: 100,
    }).catch(e => e);

    expect(err).toBeInstanceOf(ForwardError);
    const msg: string = (err as ForwardError).message;
    expect(msg).toContain('run-1');
    expect(msg).toContain('cancelled');
    expect(msg).toContain('run_agent_on_pull_request');
  });
});

// ---------------------------------------------------------------------------
// timeout branch
// ---------------------------------------------------------------------------

describe('waitForRun — timeout', () => {
  it('throws ForwardError fast when timeoutMs < intervalMs (one iteration, no sleep)', async () => {
    const client = makeClient({
      listRuns: async () => [makeRun('running')],
    });

    const start = Date.now();
    const err = await waitForRun(client, 'pr-1', 'run-1', {
      intervalMs: 10_000, // large interval
      timeoutMs: 1,       // timeout smaller than interval → 1 attempt, no sleep
    }).catch(e => e);
    const elapsed = Date.now() - start;

    expect(err).toBeInstanceOf(ForwardError);
    const msg: string = (err as ForwardError).message;
    expect(msg).toContain('run-1');
    expect(msg).toContain('still running');
    expect(msg).toContain('get_findings');
    // Should complete nearly instantly (no sleep was performed)
    expect(elapsed).toBeLessThan(500);
  });

  it('includes the timeout seconds in the ForwardError message', async () => {
    const client = makeClient({
      listRuns: async () => [makeRun('running')],
    });

    // Use intervalMs > timeoutMs so maxAttempts = 1 and no sleep happens,
    // while still producing a message that quotes "180s".
    const err = await waitForRun(client, 'pr-1', 'run-1', {
      intervalMs: 200_000,  // larger than timeout → ceil(180000/200000) = 1 attempt
      timeoutMs: 180_000,
    }).catch(e => e);

    expect(err).toBeInstanceOf(ForwardError);
    // timeoutMs/1000 = 180
    expect((err as ForwardError).message).toContain('180s');
  });
});

// ---------------------------------------------------------------------------
// run_id selection among multiple rows
// ---------------------------------------------------------------------------

describe('waitForRun — run_id selection', () => {
  it('returns the correct run when multiple runs are present', async () => {
    const client = makeClient({
      listRuns: async () => [
        makeRun('running', 'run-other'),
        makeRun('done', 'run-target'),
        makeRun('failed', 'run-another', 'some error'),
      ],
    });

    const result = await waitForRun(client, 'pr-1', 'run-target', {
      intervalMs: 10,
      timeoutMs: 100,
    });

    expect(result.run_id).toBe('run-target');
    expect(result.status).toBe('done');
  });

  it('times out when the target run_id is not in the list', async () => {
    const client = makeClient({
      // Returns a run with a DIFFERENT id — target not found
      listRuns: async () => [makeRun('done', 'run-other')],
    });

    const err = await waitForRun(client, 'pr-1', 'run-missing', {
      intervalMs: 10_000,
      timeoutMs: 1,
    }).catch(e => e);

    expect(err).toBeInstanceOf(ForwardError);
    expect((err as ForwardError).message).toContain('run-missing');
  });

  it('throws ForwardError for the correct run_id when it fails', async () => {
    const client = makeClient({
      listRuns: async () => [
        makeRun('done', 'run-ok'),
        makeRun('failed', 'run-bad', 'quota exceeded'),
      ],
    });

    const err = await waitForRun(client, 'pr-1', 'run-bad', {
      intervalMs: 10,
      timeoutMs: 100,
    }).catch(e => e);

    expect(err).toBeInstanceOf(ForwardError);
    expect((err as ForwardError).message).toContain('run-bad');
    expect((err as ForwardError).message).toContain('quota exceeded');
  });
});
