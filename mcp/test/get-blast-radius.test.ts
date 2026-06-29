/**
 * Tests for get-blast-radius.ts — getBlastRadiusHandler.
 *
 * Uses a plain fake ApiClient (no fetch). Verifies: success (maps the blast
 * map to structuredContent), resolve miss → isError, empty map → success text,
 * degraded flag surfaced, and API errors → isError (never throws).
 */

import { describe, it, expect, vi } from 'vitest';
import { getBlastRadiusHandler } from '../src/tools/get-blast-radius.js';
import { ApiError } from '../src/api-client.js';
import type { ApiClient } from '../src/api-client.js';
import type { Repo, BlastResponse } from '@devdigest/shared';

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
    blastRadius: vi
      .fn<() => Promise<never>>()
      .mockRejectedValue(new Error('blastRadius was called unexpectedly')),
    ...overrides,
  };
}

const DEPS = { config: { apiUrl: 'http://localhost:3001' } };

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

function makeBlast(over: Partial<BlastResponse> = {}): BlastResponse {
  return {
    blast: {
      summary: 'Touches the public rate limiter.',
      changed_symbols: [{ name: 'rateLimit', file: 'src/lib/rate.ts', kind: 'function' }],
      downstream: [
        {
          symbol: 'rateLimit',
          callers: [
            { name: 'handler', file: 'src/api/public/index.ts', line: 23 },
            { name: 'onWebhook', file: 'src/api/public/webhooks.ts', line: 45 },
          ],
          endpoints_affected: ['GET /api/public/items'],
          crons_affected: [],
        },
      ],
    },
    degraded: false,
    index_status: 'full',
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Success
// ---------------------------------------------------------------------------

describe('getBlastRadiusHandler — success', () => {
  it('maps the blast map to structuredContent', async () => {
    const blastRadius = vi.fn(async () => makeBlast());
    const client = makeClient({ listRepos: async () => [makeRepo('acme/api')], blastRadius });

    const result = await getBlastRadiusHandler(
      { client, ...DEPS },
      { repo: 'acme/api', files: ['src/lib/rate.ts'] },
    );

    expect(result.isError).toBeFalsy();
    expect(blastRadius).toHaveBeenCalledWith('repo-uuid', ['src/lib/rate.ts']);

    const sc = result.structuredContent as {
      summary: string;
      downstream: { symbol: string; callers: unknown[]; endpoints_affected: string[] }[];
      degraded: boolean;
      index_status: string | null;
    };
    expect(sc.summary).toBe('Touches the public rate limiter.');
    expect(sc.downstream[0]!.callers).toHaveLength(2);
    expect(sc.downstream[0]!.endpoints_affected).toEqual(['GET /api/public/items']);
    expect(sc.degraded).toBe(false);
    expect(sc.index_status).toBe('full');
  });

  it('surfaces the degraded flag', async () => {
    const client = makeClient({
      listRepos: async () => [makeRepo('acme/api')],
      blastRadius: async () => makeBlast({ degraded: true, reason: 'no_data', index_status: 'degraded' }),
    });

    const result = await getBlastRadiusHandler(
      { client, ...DEPS },
      { repo: 'acme/api', files: ['src/lib/rate.ts'] },
    );

    const sc = result.structuredContent as { degraded: boolean; index_status: string | null };
    expect(sc.degraded).toBe(true);
    expect(sc.index_status).toBe('degraded');
  });
});

// ---------------------------------------------------------------------------
// Empty map — success (not error)
// ---------------------------------------------------------------------------

describe('getBlastRadiusHandler — empty map', () => {
  it('returns a non-error setup hint when no symbols are indexed', async () => {
    const client = makeClient({
      listRepos: async () => [makeRepo('acme/api')],
      blastRadius: async () =>
        makeBlast({ blast: { summary: '', changed_symbols: [], downstream: [] } }),
    });

    const result = await getBlastRadiusHandler(
      { client, ...DEPS },
      { repo: 'acme/api', files: ['src/lib/rate.ts'] },
    );

    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text?: string } | undefined)?.text ?? '';
    expect(text).toContain('no blast radius');
    expect(text).toContain('"acme/api"');
  });

  it('mentions the degraded index in the empty hint', async () => {
    const client = makeClient({
      listRepos: async () => [makeRepo('acme/api')],
      blastRadius: async () =>
        makeBlast({
          blast: { summary: '', changed_symbols: [], downstream: [] },
          degraded: true,
          index_status: 'degraded',
        }),
    });

    const result = await getBlastRadiusHandler(
      { client, ...DEPS },
      { repo: 'acme/api', files: ['x.ts'] },
    );
    const text = (result.content[0] as { text?: string } | undefined)?.text ?? '';
    expect(text).toMatch(/degraded/i);
  });
});

// ---------------------------------------------------------------------------
// Errors — never throws
// ---------------------------------------------------------------------------

describe('getBlastRadiusHandler — errors', () => {
  it('returns isError:true when the repo is not found', async () => {
    const client = makeClient({ listRepos: async () => [makeRepo('acme/other')] });

    const result = await getBlastRadiusHandler(
      { client, ...DEPS },
      { repo: 'acme/unknown', files: [] },
    );

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text?: string } | undefined)?.text).toContain('"acme/unknown"');
  });

  it('maps an ApiError to isError:true without throwing', async () => {
    const client = makeClient({
      listRepos: async () => [makeRepo('acme/api')],
      blastRadius: async () => {
        throw new ApiError({ code: 'not_found', message: 'Pull request not found', status: 404 });
      },
    });

    const result = await getBlastRadiusHandler(
      { client, ...DEPS },
      { repo: 'acme/api', files: ['x.ts'] },
    );

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text?: string } | undefined)?.text).toContain('API error');
  });
});
