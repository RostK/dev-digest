/**
 * Tests for get-blast-radius.ts — getBlastRadiusHandler.
 *
 * This is a STUB tool: it ALWAYS returns isError:true, never throws,
 * and never calls the (fake) client. These tests verify that contract.
 */

import { describe, it, expect, vi } from 'vitest';
import { getBlastRadiusHandler } from '../src/tools/get-blast-radius.js';
import type { ApiClient } from '../src/api-client.js';

// ---------------------------------------------------------------------------
// Fake-client builder (should never be called for this tool)
// ---------------------------------------------------------------------------

function makeClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    listAgents: vi.fn<() => Promise<never>>().mockRejectedValue(new Error('listAgents was called')),
    listRepos: vi.fn<() => Promise<never>>().mockRejectedValue(new Error('listRepos was called')),
    listPulls: vi.fn<() => Promise<never>>().mockRejectedValue(new Error('listPulls was called')),
    runReview: vi.fn<() => Promise<never>>().mockRejectedValue(new Error('runReview was called')),
    listRuns: vi.fn<() => Promise<never>>().mockRejectedValue(new Error('listRuns was called')),
    listReviews: vi.fn<() => Promise<never>>().mockRejectedValue(new Error('listReviews was called')),
    listConventions: vi.fn<() => Promise<never>>().mockRejectedValue(new Error('listConventions was called')),
    ...overrides,
  };
}

const DEPS = {
  config: { apiUrl: 'http://localhost:3001' },
};

// ---------------------------------------------------------------------------
// Always isError:true
// ---------------------------------------------------------------------------

describe('getBlastRadiusHandler — always stub error', () => {
  it('returns isError:true', async () => {
    const client = makeClient();

    const result = await getBlastRadiusHandler(
      { client, ...DEPS },
      { repo: 'acme/api', files: ['src/index.ts'] },
    );

    expect(result.isError).toBe(true);
  });

  it('includes "not implemented yet" in the text message', async () => {
    const client = makeClient();

    const result = await getBlastRadiusHandler(
      { client, ...DEPS },
      { repo: 'acme/api', files: ['src/index.ts'] },
    );

    const text = result.content[0]?.text ?? '';
    expect(text).toContain('not implemented yet');
  });

  it('mentions blast route / later lesson in the message', async () => {
    const client = makeClient();

    const result = await getBlastRadiusHandler(
      { client, ...DEPS },
      { repo: 'acme/api', files: [] },
    );

    const text = result.content[0]?.text ?? '';
    expect(text).toMatch(/later lesson|repo-intel/i);
  });
});

// ---------------------------------------------------------------------------
// Never calls the client
// ---------------------------------------------------------------------------

describe('getBlastRadiusHandler — never calls the client', () => {
  it('does not call any ApiClient method', async () => {
    const client = makeClient();

    // getBlastRadiusHandler is expected to NEVER call the client.
    // If it did, the vi.fn() mocks above would reject, causing the handler
    // to either throw or return an error unrelated to the stub message.
    const result = await getBlastRadiusHandler(
      { client, ...DEPS },
      { repo: 'acme/api', files: ['src/index.ts'] },
    );

    // Verify the result is the stub error, not a client-caused error.
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('not implemented yet');

    // Verify no client methods were called.
    expect(vi.mocked(client.listRepos)).not.toHaveBeenCalled();
    expect(vi.mocked(client.listAgents)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Never throws — always returns a CallToolResult
// ---------------------------------------------------------------------------

describe('getBlastRadiusHandler — never throws', () => {
  it('does not throw even with empty files array', async () => {
    const client = makeClient();

    await expect(
      getBlastRadiusHandler({ client, ...DEPS }, { repo: 'acme/api', files: [] }),
    ).resolves.not.toThrow();
  });

  it('does not throw with various inputs', async () => {
    const client = makeClient();

    const inputs = [
      { repo: 'org/repo', files: [] },
      { repo: 'a/b', files: ['x.ts', 'y.ts', 'z.ts'] },
      { repo: '', files: [] },
    ];

    for (const input of inputs) {
      const result = await getBlastRadiusHandler({ client, ...DEPS }, input);
      expect(result.isError).toBe(true);
    }
  });
});
