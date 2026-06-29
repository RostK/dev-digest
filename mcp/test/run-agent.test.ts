/**
 * Tests for run-agent.ts — runAgentHandler.
 *
 * Uses a plain fake ApiClient (no fetch, no HttpApiClient).
 * Covers: happy path, failed/cancelled/timeout branches, resolve misses.
 */

import { describe, it, expect } from 'vitest';
import { runAgentHandler } from '../src/tools/run-agent.js';
import type { ApiClient } from '../src/api-client.js';
import type { Agent, Repo, PrMeta, ReviewRecord, RunSummary } from '@devdigest/shared';

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
    blastRadius: async () => ({ blast: { changed_symbols: [], downstream: [], summary: '' }, degraded: false, index_status: null }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DEPS = {
  config: { apiUrl: 'http://localhost:3001', reviewTimeoutMs: 50, pollIntervalMs: 10 },
};

function makeRepo(fullName: string, id = 'repo-uuid'): Repo {
  return {
    id,
    workspace_id: 'ws-1',
    owner: fullName.split('/')[0] ?? 'owner',
    name: fullName.split('/')[1] ?? 'name',
    full_name: fullName,
    default_branch: 'main',
    clone_path: null,
    last_polled_at: null,
    created_by: null,
  };
}

function makePr(number: number, id = 'pr-uuid'): PrMeta {
  return {
    id,
    number,
    title: `PR #${number}`,
    author: 'dev',
    branch: 'feature/x',
    base: 'main',
    head_sha: 'abc',
    additions: 10,
    deletions: 5,
    files_count: 2,
    status: 'open',
  };
}

function makeAgent(id: string): Agent {
  return {
    id,
    name: `Agent ${id}`,
    description: 'Test agent',
    provider: 'openai',
    model: 'gpt-4',
    system_prompt: 'You are a reviewer.',
    output_schema: null,
    enabled: true,
    version: 1,
    strategy: 'single-pass',
    ci_fail_on: 'critical',
    repo_intel: true,
  };
}

function makeRun(
  runId: string,
  status: string,
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

function makeReview(runId: string | null = 'run-1'): ReviewRecord {
  return {
    id: 'rev-1',
    pr_id: 'pr-uuid',
    agent_id: 'agent-1',
    run_id: runId,
    agent_name: 'Test Agent',
    kind: 'review',
    verdict: 'approve',
    summary: 'Looks good.',
    score: 95,
    model: 'gpt-4',
    grounding: null,
    created_at: new Date().toISOString(),
    findings: [],
  };
}

// ---------------------------------------------------------------------------
// Happy path — full sequence
// ---------------------------------------------------------------------------

describe('runAgentHandler — happy path', () => {
  it('returns structuredContent with verdict and findings', async () => {
    let listRunsCallCount = 0;
    const client = makeClient({
      listRepos: async () => [makeRepo('acme/api')],
      listPulls: async () => [makePr(42)],
      listAgents: async () => [makeAgent('agent-abc')],
      runReview: async () => ({
        pr_id: 'pr-uuid',
        runs: [{ run_id: 'run-1', agent_id: 'agent-abc', agent_name: 'Agent agent-abc' }],
        reviews: [],
      }),
      listRuns: async () => {
        listRunsCallCount++;
        // First poll: running; second poll: done
        return listRunsCallCount === 1
          ? [makeRun('run-1', 'running')]
          : [makeRun('run-1', 'done')];
      },
      listReviews: async () => [makeReview('run-1')],
    });

    const result = await runAgentHandler(
      { client, ...DEPS },
      { repo: 'acme/api', pr: 42, agent: 'agent-abc' },
    );

    expect(result.isError).toBeFalsy();
    const sc = result.structuredContent as {
      verdict: string;
      summary: string;
      score: number;
      findings_count: number;
      findings: unknown[];
    };
    expect(sc.verdict).toBe('approve');
    expect(sc.summary).toBe('Looks good.');
    expect(sc.score).toBe(95);
    expect(sc.findings_count).toBe(0);
    expect(sc.findings).toEqual([]);
  });

  it('matches review by run_id when multiple reviews exist', async () => {
    const client = makeClient({
      listRepos: async () => [makeRepo('acme/api')],
      listPulls: async () => [makePr(42)],
      listAgents: async () => [makeAgent('agent-abc')],
      runReview: async () => ({
        pr_id: 'pr-uuid',
        runs: [{ run_id: 'run-new', agent_id: 'agent-abc', agent_name: 'Agent' }],
        reviews: [],
      }),
      listRuns: async () => [makeRun('run-new', 'done')],
      listReviews: async () => [
        makeReview('run-new'),
        { ...makeReview('run-old'), verdict: 'request_changes', score: 50 },
      ],
    });

    const result = await runAgentHandler(
      { client, ...DEPS },
      { repo: 'acme/api', pr: 42, agent: 'agent-abc' },
    );

    expect(result.isError).toBeFalsy();
    const sc = result.structuredContent as { verdict: string };
    expect(sc.verdict).toBe('approve'); // matched the run-new review, not the older one
  });

  it('falls back to newest review when run_id is null', async () => {
    const client = makeClient({
      listRepos: async () => [makeRepo('acme/api')],
      listPulls: async () => [makePr(42)],
      listAgents: async () => [makeAgent('agent-abc')],
      runReview: async () => ({
        pr_id: 'pr-uuid',
        runs: [{ run_id: 'run-1', agent_id: 'agent-abc', agent_name: 'Agent' }],
        reviews: [],
      }),
      listRuns: async () => [makeRun('run-1', 'done')],
      // run_id is null in all reviews — should fall back to newest (index 0)
      listReviews: async () => [makeReview(null)],
    });

    const result = await runAgentHandler(
      { client, ...DEPS },
      { repo: 'acme/api', pr: 42, agent: 'agent-abc' },
    );

    expect(result.isError).toBeFalsy();
    expect((result.structuredContent as { verdict: string }).verdict).toBe('approve');
  });
});

// ---------------------------------------------------------------------------
// Failed run branch
// ---------------------------------------------------------------------------

describe('runAgentHandler — failed run', () => {
  it('returns isError:true with provider key hint', async () => {
    const client = makeClient({
      listRepos: async () => [makeRepo('acme/api')],
      listPulls: async () => [makePr(42)],
      listAgents: async () => [makeAgent('agent-abc')],
      runReview: async () => ({
        pr_id: 'pr-uuid',
        runs: [{ run_id: 'run-fail', agent_id: 'agent-abc', agent_name: 'Agent' }],
        reviews: [],
      }),
      listRuns: async () => [makeRun('run-fail', 'failed', 'OPENAI_API_KEY not set')],
    });

    const result = await runAgentHandler(
      { client, ...DEPS },
      { repo: 'acme/api', pr: 42, agent: 'agent-abc' },
    );

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text?: string } | undefined)?.text ?? '';
    expect(text).toContain('run-fail');
    expect(text).toContain('OPENAI_API_KEY not set');
    expect(text).toContain('Settings');
  });
});

// ---------------------------------------------------------------------------
// Cancelled run branch
// ---------------------------------------------------------------------------

describe('runAgentHandler — cancelled run', () => {
  it('returns isError:true with retry hint', async () => {
    const client = makeClient({
      listRepos: async () => [makeRepo('acme/api')],
      listPulls: async () => [makePr(42)],
      listAgents: async () => [makeAgent('agent-abc')],
      runReview: async () => ({
        pr_id: 'pr-uuid',
        runs: [{ run_id: 'run-cancel', agent_id: 'agent-abc', agent_name: 'Agent' }],
        reviews: [],
      }),
      listRuns: async () => [makeRun('run-cancel', 'cancelled')],
    });

    const result = await runAgentHandler(
      { client, ...DEPS },
      { repo: 'acme/api', pr: 42, agent: 'agent-abc' },
    );

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text?: string } | undefined)?.text ?? '';
    expect(text).toContain('cancelled');
    expect(text).toContain('run_agent_on_pull_request');
  });
});

// ---------------------------------------------------------------------------
// Timeout branch
// ---------------------------------------------------------------------------

describe('runAgentHandler — timeout', () => {
  it('returns isError:true with get_findings hint', async () => {
    const client = makeClient({
      listRepos: async () => [makeRepo('acme/api')],
      listPulls: async () => [makePr(42)],
      listAgents: async () => [makeAgent('agent-abc')],
      runReview: async () => ({
        pr_id: 'pr-uuid',
        runs: [{ run_id: 'run-slow', agent_id: 'agent-abc', agent_name: 'Agent' }],
        reviews: [],
      }),
      // Always returns running — causes timeout
      listRuns: async () => [makeRun('run-slow', 'running')],
    });

    // timeoutMs < intervalMs → 1 attempt, no sleep, immediate timeout
    const result = await runAgentHandler(
      { client, config: { apiUrl: 'http://localhost:3001', reviewTimeoutMs: 1, pollIntervalMs: 10_000 } },
      { repo: 'acme/api', pr: 42, agent: 'agent-abc' },
    );

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text?: string } | undefined)?.text ?? '';
    expect(text).toContain('still running');
    expect(text).toContain('get_findings');
  });
});

// ---------------------------------------------------------------------------
// No run returned — review did not start
// ---------------------------------------------------------------------------

describe('runAgentHandler — no run returned', () => {
  it('returns isError:true with retry hint when runs array is empty', async () => {
    const client = makeClient({
      listRepos: async () => [makeRepo('acme/api')],
      listPulls: async () => [makePr(42)],
      listAgents: async () => [makeAgent('agent-abc')],
      // Returns empty runs array
      runReview: async () => ({ pr_id: 'pr-uuid', runs: [], reviews: [] }),
    });

    const result = await runAgentHandler(
      { client, ...DEPS },
      { repo: 'acme/api', pr: 42, agent: 'agent-abc' },
    );

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text?: string } | undefined)?.text).toContain('review did not start');
  });
});

// ---------------------------------------------------------------------------
// Resolve misses — unknown repo / PR / agent → forward-leading isError
// ---------------------------------------------------------------------------

describe('runAgentHandler — resolve miss', () => {
  it('returns isError:true when repo is not found', async () => {
    const client = makeClient({
      listRepos: async () => [makeRepo('acme/other')],
    });

    const result = await runAgentHandler(
      { client, ...DEPS },
      { repo: 'acme/unknown', pr: 42, agent: 'agent-abc' },
    );

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text?: string } | undefined)?.text).toContain('"acme/unknown"');
    expect((result.content[0] as { text?: string } | undefined)?.text).toContain('acme/other');
  });

  it('returns isError:true when PR is not found', async () => {
    const client = makeClient({
      listRepos: async () => [makeRepo('acme/api')],
      listPulls: async () => [makePr(10)],
    });

    const result = await runAgentHandler(
      { client, ...DEPS },
      { repo: 'acme/api', pr: 99, agent: 'agent-abc' },
    );

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text?: string } | undefined)?.text ?? '';
    expect(text).toContain('#99');
    expect(text).toContain('10');
  });

  it('returns isError:true when agent is not found', async () => {
    const client = makeClient({
      listRepos: async () => [makeRepo('acme/api')],
      listPulls: async () => [makePr(42)],
      listAgents: async () => [makeAgent('agent-1'), makeAgent('agent-2')],
    });

    const result = await runAgentHandler(
      { client, ...DEPS },
      { repo: 'acme/api', pr: 42, agent: 'agent-unknown' },
    );

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text?: string } | undefined)?.text ?? '';
    expect(text).toContain("'agent-unknown'");
    expect(text).toContain('list_agents');
  });
});

// ---------------------------------------------------------------------------
// Does not throw — always returns a CallToolResult
// ---------------------------------------------------------------------------

describe('runAgentHandler — never throws', () => {
  it('returns isError:true instead of throwing on unexpected errors', async () => {
    const client = makeClient({
      listRepos: async () => { throw new Error('boom'); },
    });

    const result = await runAgentHandler(
      { client, ...DEPS },
      { repo: 'acme/api', pr: 42, agent: 'agent-abc' },
    );

    expect(result.isError).toBe(true);
  });
});
