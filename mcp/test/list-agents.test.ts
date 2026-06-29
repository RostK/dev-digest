/**
 * Tests for list-agents.ts — listAgentsHandler.
 *
 * Uses a plain fake ApiClient (no fetch, no HttpApiClient).
 * Verifies success mapping, empty-list text, and NetworkError handling.
 */

import { describe, it, expect } from 'vitest';
import { listAgentsHandler } from '../src/tools/list-agents.js';
import { NetworkError } from '../src/api-client.js';
import type { ApiClient } from '../src/api-client.js';
import type { Agent } from '@devdigest/shared';

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

function makeAgent(id: string, name = `Agent ${id}`, enabled = true): Agent {
  return {
    id,
    name,
    description: 'Test agent',
    provider: 'openai',
    model: 'gpt-4',
    system_prompt: 'You are a reviewer.',
    output_schema: null,
    enabled,
    version: 1,
    strategy: 'single-pass',
    ci_fail_on: 'critical',
    repo_intel: true,
  };
}

// ---------------------------------------------------------------------------
// Success — maps agents
// ---------------------------------------------------------------------------

describe('listAgentsHandler — success', () => {
  it('returns structuredContent with agents array', async () => {
    const agents = [makeAgent('agent-1', 'Security', true), makeAgent('agent-2', 'Perf', false)];
    const client = makeClient({ listAgents: async () => agents });

    const result = await listAgentsHandler({ client, ...DEPS });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toBeDefined();
    const sc = result.structuredContent as { agents: { id: string; name: string; enabled: boolean }[] };
    expect(sc.agents).toHaveLength(2);
    expect(sc.agents[0]).toEqual({ id: 'agent-1', name: 'Security', enabled: true });
    expect(sc.agents[1]).toEqual({ id: 'agent-2', name: 'Perf', enabled: false });
  });

  it('includes agents in the text content block', async () => {
    const client = makeClient({ listAgents: async () => [makeAgent('agent-abc')] });

    const result = await listAgentsHandler({ client, ...DEPS });

    const text = (result.content[0] as { text?: string } | undefined)?.text ?? '';
    expect(text).toContain('agent-abc');
  });
});

// ---------------------------------------------------------------------------
// Empty list — success (not error)
// ---------------------------------------------------------------------------

describe('listAgentsHandler — empty list', () => {
  it('returns isError falsy and includes setup hint in text', async () => {
    const client = makeClient({ listAgents: async () => [] });

    const result = await listAgentsHandler({ client, ...DEPS });

    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text?: string } | undefined)?.text ?? '';
    expect(text).toContain('no agents configured');
    expect(text).toContain('list_agents');
  });

  it('returns empty agents array in structuredContent', async () => {
    const client = makeClient({ listAgents: async () => [] });

    const result = await listAgentsHandler({ client, ...DEPS });

    const sc = result.structuredContent as { agents: unknown[] };
    expect(sc.agents).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// NetworkError — isError + "is the server running?"
// ---------------------------------------------------------------------------

describe('listAgentsHandler — NetworkError', () => {
  it('returns isError:true with server-running hint', async () => {
    const client = makeClient({
      listAgents: async () => {
        throw new NetworkError({ message: 'connection refused' });
      },
    });

    const result = await listAgentsHandler({ client, ...DEPS });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text?: string } | undefined)?.text ?? '';
    expect(text).toContain('is the server running');
    expect(text).toContain('http://localhost:3001');
  });

  it('uses the configured apiUrl in the error message', async () => {
    const client = makeClient({
      listAgents: async () => {
        throw new NetworkError({ message: 'ECONNREFUSED' });
      },
    });

    const result = await listAgentsHandler({
      client,
      config: { apiUrl: 'http://custom-host:9999' },
    });

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text?: string } | undefined)?.text).toContain('http://custom-host:9999');
  });
});

// ---------------------------------------------------------------------------
// Does not throw — always returns a CallToolResult
// ---------------------------------------------------------------------------

describe('listAgentsHandler — never throws', () => {
  it('returns isError:true instead of throwing on unexpected errors', async () => {
    const client = makeClient({
      listAgents: async () => {
        throw new Error('Some unexpected crash');
      },
    });

    const result = await listAgentsHandler({ client, ...DEPS });

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text?: string } | undefined)?.text).toContain('Some unexpected crash');
  });
});
