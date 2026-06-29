/**
 * Tests for get-findings.ts — getFindingsHandler.
 *
 * Uses a plain fake ApiClient (no fetch, no HttpApiClient).
 * Verifies: success (newest review); no-reviews → forward-leading isError.
 */

import { describe, it, expect } from 'vitest';
import { getFindingsHandler } from '../src/tools/get-findings.js';
import { ForwardError } from '../src/errors.js';
import type { ApiClient } from '../src/api-client.js';
import type { Repo, PrMeta, ReviewRecord } from '@devdigest/shared';

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
    blastForPr: async () => ({ blast: { changed_symbols: [], downstream: [], summary: '' }, degraded: false, index_status: null }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DEPS = {
  config: { apiUrl: 'http://localhost:3001' },
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

function makeReview(id = 'rev-1', runId: string | null = 'run-1'): ReviewRecord {
  return {
    id,
    pr_id: 'pr-uuid',
    agent_id: 'agent-1',
    run_id: runId,
    agent_name: 'Test Agent',
    kind: 'review',
    verdict: 'approve',
    summary: 'Looks good',
    score: 92,
    model: 'gpt-4',
    grounding: null,
    created_at: new Date().toISOString(),
    findings: [],
  };
}

// ---------------------------------------------------------------------------
// Success — returns newest review
// ---------------------------------------------------------------------------

describe('getFindingsHandler — success', () => {
  it('returns the newest review mapped to VerdictResult', async () => {
    const client = makeClient({
      listRepos: async () => [makeRepo('acme/api')],
      listPulls: async () => [makePr(42)],
      listReviews: async () => [makeReview('rev-newest'), makeReview('rev-older')],
    });

    const result = await getFindingsHandler(
      { client, ...DEPS },
      { repo: 'acme/api', pr: 42 },
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
    expect(sc.summary).toBe('Looks good');
    expect(sc.score).toBe(92);
    expect(sc.findings_count).toBe(0);
    expect(sc.findings).toEqual([]);
  });

  it('includes verdict in text content block', async () => {
    const client = makeClient({
      listRepos: async () => [makeRepo('acme/api')],
      listPulls: async () => [makePr(42)],
      listReviews: async () => [makeReview()],
    });

    const result = await getFindingsHandler(
      { client, ...DEPS },
      { repo: 'acme/api', pr: 42 },
    );

    expect((result.content[0] as { text?: string } | undefined)?.text).toContain('approve');
  });
});

// ---------------------------------------------------------------------------
// No reviews — forward-leading isError
// ---------------------------------------------------------------------------

describe('getFindingsHandler — no reviews', () => {
  it('returns isError:true with run_agent_on_pull_request hint', async () => {
    const client = makeClient({
      listRepos: async () => [makeRepo('acme/api')],
      listPulls: async () => [makePr(42)],
      listReviews: async () => [],
    });

    const result = await getFindingsHandler(
      { client, ...DEPS },
      { repo: 'acme/api', pr: 42 },
    );

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text?: string } | undefined)?.text ?? '';
    expect(text).toContain('no completed review');
    expect(text).toContain('"acme/api"');
    expect(text).toContain('#42');
    expect(text).toContain('run_agent_on_pull_request');
  });
});

// ---------------------------------------------------------------------------
// Resolve miss — repo not found → forward-leading isError
// ---------------------------------------------------------------------------

describe('getFindingsHandler — resolve miss', () => {
  it('returns isError:true when repo not found', async () => {
    const client = makeClient({
      listRepos: async () => [makeRepo('acme/other')],
    });

    const result = await getFindingsHandler(
      { client, ...DEPS },
      { repo: 'acme/unknown', pr: 42 },
    );

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text?: string } | undefined)?.text).toContain('"acme/unknown"');
  });

  it('returns isError:true when PR not found', async () => {
    const client = makeClient({
      listRepos: async () => [makeRepo('acme/api')],
      listPulls: async () => [makePr(10)],
    });

    const result = await getFindingsHandler(
      { client, ...DEPS },
      { repo: 'acme/api', pr: 99 },
    );

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text?: string } | undefined)?.text).toContain('#99');
    expect((result.content[0] as { text?: string } | undefined)?.text).toContain('10');
  });

  it('does not throw — always returns a result', async () => {
    const client = makeClient({
      listRepos: async () => { throw new ForwardError('test'); },
    });

    const result = await getFindingsHandler(
      { client, ...DEPS },
      { repo: 'x/y', pr: 1 },
    );

    expect(result.isError).toBe(true);
  });
});
