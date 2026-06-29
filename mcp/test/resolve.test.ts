/**
 * Tests for resolve.ts — resolveRepo, resolvePr, resolveAgent.
 *
 * Uses a plain fake ApiClient object (no fetch, no HttpApiClient).
 * Verifies both the happy path (returns the expected value) and the miss path
 * (throws a ForwardError whose message enumerates the valid options).
 */

import { describe, it, expect } from 'vitest';
import { resolveRepo, resolvePr, resolveAgent } from '../src/resolve.js';
import { ForwardError } from '../src/errors.js';
import type { ApiClient } from '../src/api-client.js';
import type { Agent, Repo, PrMeta } from '@devdigest/shared';

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
// Minimal fixture factories
// ---------------------------------------------------------------------------

function makeRepo(fullName: string, id = 'uuid-repo'): Repo {
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

function makePr(number: number, id: string | null | undefined): PrMeta {
  return {
    id,
    number,
    title: `PR #${number}`,
    author: 'user',
    branch: `feature/${number}`,
    base: 'main',
    head_sha: 'abc123',
    additions: 5,
    deletions: 2,
    files_count: 1,
    status: 'open',
  };
}

function makeAgent(id: string): Agent {
  return {
    id,
    name: `Agent ${id}`,
    description: 'A test agent',
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

// ---------------------------------------------------------------------------
// resolveRepo
// ---------------------------------------------------------------------------

describe('resolveRepo', () => {
  it('returns the matching Repo when full_name matches', async () => {
    const repo = makeRepo('acme/payments-api');
    const client = makeClient({ listRepos: async () => [repo] });

    const result = await resolveRepo(client, 'acme/payments-api');

    expect(result).toEqual(repo);
  });

  it('throws ForwardError listing available repos when no match', async () => {
    const client = makeClient({
      listRepos: async () => [
        makeRepo('acme/payments-api'),
        makeRepo('acme/auth-service'),
      ],
    });

    const err = await resolveRepo(client, 'acme/unknown').catch(e => e);

    expect(err).toBeInstanceOf(ForwardError);
    const msg: string = (err as ForwardError).message;
    expect(msg).toContain('"acme/unknown"');
    expect(msg).toContain('acme/payments-api');
    expect(msg).toContain('acme/auth-service');
  });

  it('throws ForwardError suggesting to add a repo when list is empty', async () => {
    const client = makeClient({ listRepos: async () => [] });

    const err = await resolveRepo(client, 'org/repo').catch(e => e);

    expect(err).toBeInstanceOf(ForwardError);
    const msg: string = (err as ForwardError).message;
    expect(msg).toContain('"org/repo"');
    // Should mention adding a repo since the list is empty
    expect(msg).toMatch(/add|DevDigest/i);
  });

  it('sets ForwardError.name to "ForwardError"', async () => {
    const client = makeClient({ listRepos: async () => [] });

    const err = await resolveRepo(client, 'x/y').catch(e => e);

    expect((err as ForwardError).name).toBe('ForwardError');
  });
});

// ---------------------------------------------------------------------------
// resolvePr
// ---------------------------------------------------------------------------

describe('resolvePr', () => {
  it('returns the PR uuid when the number matches and id is non-nullish', async () => {
    const client = makeClient({
      listPulls: async () => [makePr(42, 'uuid-42')],
    });

    const id = await resolvePr(client, 'repo-uuid', 42);

    expect(id).toBe('uuid-42');
  });

  it('throws ForwardError listing known PR numbers when number is not found', async () => {
    const client = makeClient({
      listPulls: async () => [makePr(10, 'uuid-10'), makePr(20, 'uuid-20')],
    });

    const err = await resolvePr(client, 'repo-uuid', 99).catch(e => e);

    expect(err).toBeInstanceOf(ForwardError);
    const msg: string = (err as ForwardError).message;
    expect(msg).toContain('#99');
    expect(msg).toContain('10');
    expect(msg).toContain('20');
  });

  it('skips a PR with a matching number but nullish id (null)', async () => {
    const client = makeClient({
      // PR #42 exists in GitHub but has not been fully imported (id is null)
      listPulls: async () => [makePr(42, null), makePr(100, 'uuid-100')],
    });

    const err = await resolvePr(client, 'repo-uuid', 42).catch(e => e);

    // Should throw even though #42 is in the list, because its id is null
    expect(err).toBeInstanceOf(ForwardError);
    const msg: string = (err as ForwardError).message;
    expect(msg).toContain('#42');
  });

  it('skips a PR with a matching number but undefined id', async () => {
    const client = makeClient({
      listPulls: async () => [makePr(42, undefined)],
    });

    const err = await resolvePr(client, 'repo-uuid', 42).catch(e => e);

    expect(err).toBeInstanceOf(ForwardError);
  });

  it('throws ForwardError when pull list is empty', async () => {
    const client = makeClient({ listPulls: async () => [] });

    const err = await resolvePr(client, 'repo-uuid', 1).catch(e => e);

    expect(err).toBeInstanceOf(ForwardError);
    expect((err as ForwardError).message).toContain('#1');
  });

  it('returns the correct uuid among multiple PRs', async () => {
    const client = makeClient({
      listPulls: async () => [
        makePr(10, 'uuid-10'),
        makePr(20, 'uuid-20'),
        makePr(30, 'uuid-30'),
      ],
    });

    const id = await resolvePr(client, 'repo-uuid', 20);

    expect(id).toBe('uuid-20');
  });
});

// ---------------------------------------------------------------------------
// resolveAgent
// ---------------------------------------------------------------------------

describe('resolveAgent', () => {
  it('returns the matching Agent when id matches', async () => {
    const agent = makeAgent('agent-abc');
    const client = makeClient({ listAgents: async () => [agent] });

    const result = await resolveAgent(client, 'agent-abc');

    expect(result).toEqual(agent);
  });

  it('throws ForwardError directing model to call list_agents when not found', async () => {
    const client = makeClient({
      listAgents: async () => [makeAgent('agent-1'), makeAgent('agent-2')],
    });

    const err = await resolveAgent(client, 'agent-unknown').catch(e => e);

    expect(err).toBeInstanceOf(ForwardError);
    const msg: string = (err as ForwardError).message;
    expect(msg).toContain("'agent-unknown'");
    expect(msg).toContain('list_agents');
  });

  it('throws ForwardError when agent list is empty', async () => {
    const client = makeClient({ listAgents: async () => [] });

    const err = await resolveAgent(client, 'any-id').catch(e => e);

    expect(err).toBeInstanceOf(ForwardError);
    expect((err as ForwardError).message).toContain('list_agents');
  });
});
