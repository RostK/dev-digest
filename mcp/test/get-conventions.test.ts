/**
 * Tests for get-conventions.ts — getConventionsHandler.
 *
 * Uses a plain fake ApiClient (no fetch, no HttpApiClient).
 * Verifies: success (maps conventions); empty list → success text (not error).
 */

import { describe, it, expect } from 'vitest';
import { getConventionsHandler } from '../src/tools/get-conventions.js';
import type { ApiClient } from '../src/api-client.js';
import type { Repo, PrMeta, ConventionCandidate } from '@devdigest/shared';

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

function makeConvention(rule: string): ConventionCandidate {
  return {
    id: `conv-${rule}`,
    repo_id: 'repo-uuid',
    workspace_id: 'ws-1',
    category: 'Style',
    rule,
    evidence_path: 'src/index.ts',
    evidence_start_line: 10,
    evidence_end_line: 20,
    evidence_snippet: 'export function foo() {}',
    confidence: 0.9,
    accepted: true,
    created_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Success — maps conventions
// ---------------------------------------------------------------------------

describe('getConventionsHandler — success', () => {
  it('returns structuredContent with conventions array', async () => {
    const client = makeClient({
      listRepos: async () => [makeRepo('acme/api')],
      listConventions: async () => [
        makeConvention('Use named exports'),
        makeConvention('No default exports'),
      ],
    });

    const result = await getConventionsHandler(
      { client, ...DEPS },
      { repo: 'acme/api' },
    );

    expect(result.isError).toBeFalsy();
    const sc = result.structuredContent as { conventions: unknown[] };
    expect(sc.conventions).toHaveLength(2);
  });

  it('drops evidence_snippet and confidence from the output', async () => {
    const client = makeClient({
      listRepos: async () => [makeRepo('acme/api')],
      listConventions: async () => [makeConvention('Use named exports')],
    });

    const result = await getConventionsHandler(
      { client, ...DEPS },
      { repo: 'acme/api' },
    );

    const sc = result.structuredContent as { conventions: Record<string, unknown>[] };
    const first = sc.conventions[0];
    expect(first).toBeDefined();
    expect(first).not.toHaveProperty('evidence_snippet');
    expect(first).not.toHaveProperty('confidence');
    expect(first).toHaveProperty('rule', 'Use named exports');
    expect(first).toHaveProperty('category', 'Style');
    expect(first).toHaveProperty('accepted', true);
  });

  it('includes convention text in the content block', async () => {
    const client = makeClient({
      listRepos: async () => [makeRepo('acme/api')],
      listConventions: async () => [makeConvention('Prefer const')],
    });

    const result = await getConventionsHandler(
      { client, ...DEPS },
      { repo: 'acme/api' },
    );

    expect(result.content[0]?.text).toContain('Prefer const');
  });
});

// ---------------------------------------------------------------------------
// Empty list — success (not error)
// ---------------------------------------------------------------------------

describe('getConventionsHandler — empty list', () => {
  it('returns isError falsy with setup hint', async () => {
    const client = makeClient({
      listRepos: async () => [makeRepo('acme/api')],
      listConventions: async () => [],
    });

    const result = await getConventionsHandler(
      { client, ...DEPS },
      { repo: 'acme/api' },
    );

    expect(result.isError).toBeFalsy();
    const text = result.content[0]?.text ?? '';
    expect(text).toContain('no conventions stored');
    expect(text).toContain('"acme/api"');
  });

  it('returns empty conventions array in structuredContent', async () => {
    const client = makeClient({
      listRepos: async () => [makeRepo('acme/api')],
      listConventions: async () => [],
    });

    const result = await getConventionsHandler(
      { client, ...DEPS },
      { repo: 'acme/api' },
    );

    const sc = result.structuredContent as { conventions: unknown[] };
    expect(sc.conventions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Resolve miss — repo not found → forward-leading isError
// ---------------------------------------------------------------------------

describe('getConventionsHandler — resolve miss', () => {
  it('returns isError:true when repo is not found', async () => {
    const client = makeClient({
      listRepos: async () => [makeRepo('acme/other')],
    });

    const result = await getConventionsHandler(
      { client, ...DEPS },
      { repo: 'acme/unknown' },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('"acme/unknown"');
  });

  it('does not throw — always returns a result', async () => {
    const client = makeClient({
      listRepos: async () => { throw new Error('network fail'); },
    });

    const result = await getConventionsHandler(
      { client, ...DEPS },
      { repo: 'x/y' },
    );

    expect(result.isError).toBe(true);
  });
});
