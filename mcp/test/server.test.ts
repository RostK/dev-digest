/**
 * server.test.ts — verifies createServer wires exactly 5 tools.
 *
 * Uses InMemoryTransport (in-process, zero network) paired with a real MCP
 * Client so the assertion goes through the actual SDK protocol layer.
 *
 * A trivial fake ApiClient is injected — tools/list never calls any methods.
 */

import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';
import type { ApiClient } from '../src/api-client.js';

// ---------------------------------------------------------------------------
// Trivial fake ApiClient — tools/list does not call any port methods
// ---------------------------------------------------------------------------

const fakeClient: ApiClient = {
  listAgents: async () => [],
  listRepos: async () => [],
  listPulls: async () => [],
  runReview: async () => ({ pr_id: '', runs: [], reviews: [] }),
  listRuns: async () => [],
  listReviews: async () => [],
  listConventions: async () => [],
  blastRadius: async () => ({ blast: { changed_symbols: [], downstream: [], summary: '' }, degraded: false, index_status: null }),
};

const fakeConfig = {
  apiUrl: 'http://localhost:3001',
  reviewTimeoutMs: 180_000,
  pollIntervalMs: 2_000,
};

// ---------------------------------------------------------------------------
// Helper — boot a linked server+client pair, run cb, tear both down
// ---------------------------------------------------------------------------

async function withConnectedClient(
  cb: (client: Client) => Promise<void>,
): Promise<void> {
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();

  const server = createServer({ client: fakeClient, config: fakeConfig });
  const client = new Client({ name: 'test-client', version: '0.0.0' });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  try {
    await cb(client);
  } finally {
    await client.close();
    await server.close();
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const EXPECTED_TOOL_NAMES = [
  'list_agents',
  'run_agent_on_pull_request',
  'get_findings',
  'get_conventions',
  'get_blast_radius',
] as const;

describe('createServer — tool wiring', () => {
  it('registers exactly 5 tools', async () => {
    await withConnectedClient(async (client) => {
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(5);
    });
  });

  it('registers all expected tool names', async () => {
    await withConnectedClient(async (client) => {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name);

      for (const expected of EXPECTED_TOOL_NAMES) {
        expect(names).toContain(expected);
      }
    });
  });

  it('includes get_blast_radius in the tool list', async () => {
    await withConnectedClient(async (client) => {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name);
      expect(names).toContain('get_blast_radius');
    });
  });
});
