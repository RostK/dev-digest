/**
 * Tests for get-blast-radius.ts — getBlastRadiusHandler.
 *
 * Uses a plain fake ApiClient (no fetch). Verifies: success (resolves repo+pr,
 * maps the blast map to structuredContent), resolve misses -> isError, empty
 * map -> success text, degraded surfaced, and API errors -> isError.
 */

import { describe, it, expect, vi } from 'vitest';
import { getBlastRadiusHandler } from '../src/tools/get-blast-radius.js';
import { ApiError } from '../src/api-client.js';
import type { ApiClient } from '../src/api-client.js';
import type { Repo, PrMeta, BlastResponse } from '@devdigest/shared';

function makeClient(overrides: Partial<ApiClient>): ApiClient {
  return {
    listAgents: async () => [],
    listRepos: async () => [],
    listPulls: async () => [],
    runReview: async () => ({ pr_id: '', runs: [], reviews: [] }),
    listRuns: async () => [],
    listReviews: async () => [],
    listConventions: async () => [],
    blastForPr: vi
      .fn<() => Promise<never>>()
      .mockRejectedValue(new Error('blastForPr called unexpectedly')),
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

function makePull(number: number, id: string): PrMeta {
  return { number, id } as unknown as PrMeta;
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

describe('getBlastRadiusHandler — success', () => {
  it('resolves repo+pr and maps the blast map to structuredContent', async () => {
    const blastForPr = vi.fn(async () => makeBlast());
    const client = makeClient({
      listRepos: async () => [makeRepo('acme/api')],
      listPulls: async () => [makePull(482, 'pr-uuid')],
      blastForPr,
    });

    const result = await getBlastRadiusHandler({ client, ...DEPS }, { repo: 'acme/api', pr: 482 });

    expect(result.isError).toBeFalsy();
    expect(blastForPr).toHaveBeenCalledWith('pr-uuid');
    const sc = result.structuredContent as {
      summary: string;
      downstream: { callers: unknown[]; endpoints_affected: string[] }[];
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
      listPulls: async () => [makePull(482, 'pr-uuid')],
      blastForPr: async () => makeBlast({ degraded: true, reason: 'no_data', index_status: 'degraded' }),
    });
    const result = await getBlastRadiusHandler({ client, ...DEPS }, { repo: 'acme/api', pr: 482 });
    const sc = result.structuredContent as { degraded: boolean; index_status: string | null };
    expect(sc.degraded).toBe(true);
    expect(sc.index_status).toBe('degraded');
  });
});

describe('getBlastRadiusHandler — empty map', () => {
  it('returns a non-error hint when no symbols are indexed', async () => {
    const client = makeClient({
      listRepos: async () => [makeRepo('acme/api')],
      listPulls: async () => [makePull(482, 'pr-uuid')],
      blastForPr: async () =>
        makeBlast({ blast: { summary: '', changed_symbols: [], downstream: [] } }),
    });
    const result = await getBlastRadiusHandler({ client, ...DEPS }, { repo: 'acme/api', pr: 482 });
    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text?: string } | undefined)?.text ?? '';
    expect(text).toContain('no blast radius');
    expect(text).toContain('"acme/api" #482');
  });
});

describe('getBlastRadiusHandler — errors', () => {
  it('isError when the repo is not found', async () => {
    const client = makeClient({ listRepos: async () => [makeRepo('acme/other')] });
    const result = await getBlastRadiusHandler({ client, ...DEPS }, { repo: 'acme/unknown', pr: 1 });
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text?: string } | undefined)?.text).toContain('"acme/unknown"');
  });

  it('isError when the PR number is not found', async () => {
    const client = makeClient({
      listRepos: async () => [makeRepo('acme/api')],
      listPulls: async () => [makePull(1, 'other-uuid')],
    });
    const result = await getBlastRadiusHandler({ client, ...DEPS }, { repo: 'acme/api', pr: 999 });
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text?: string } | undefined)?.text).toContain('999');
  });

  it('maps an ApiError to isError without throwing', async () => {
    const client = makeClient({
      listRepos: async () => [makeRepo('acme/api')],
      listPulls: async () => [makePull(482, 'pr-uuid')],
      blastForPr: async () => {
        throw new ApiError({ code: 'not_found', message: 'Pull request not found', status: 404 });
      },
    });
    const result = await getBlastRadiusHandler({ client, ...DEPS }, { repo: 'acme/api', pr: 482 });
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text?: string } | undefined)?.text).toContain('API error');
  });
});
