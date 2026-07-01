/**
 * Tests for HttpApiClient — uses a fake fetch (no real network).
 *
 * Covers:
 *  (a) 2xx JSON response is returned parsed.
 *  (b) Correct HTTP method, URL, and JSON body are sent (runReview).
 *  (c) Non-2xx with ApiErrorBody envelope → throws ApiError with code/message/status.
 *  (d) fetch rejection (network error) → throws NetworkError.
 */

import { describe, it, expect } from 'vitest';
import {
  HttpApiClient,
  ApiError,
  NetworkError,
} from '../src/api-client.js';

// ---------------------------------------------------------------------------
// Fake-fetch helpers
// ---------------------------------------------------------------------------

type FakeResponse = {
  ok: boolean;
  status: number;
  statusText?: string;
  body: unknown;
};

/** Returns a fake fetch that resolves with the given response. */
function makeFetch(resp: FakeResponse): typeof globalThis.fetch {
  return (async () => ({
    ok: resp.ok,
    status: resp.status,
    statusText: resp.statusText ?? '',
    json: async () => resp.body,
  })) as unknown as typeof globalThis.fetch;
}

const BASE_URL = 'http://localhost:3001';

// ---------------------------------------------------------------------------
// (a) 2xx JSON responses are returned parsed
// ---------------------------------------------------------------------------

describe('HttpApiClient — successful responses', () => {
  it('returns the parsed JSON body on a 200 response', async () => {
    const agents = [{ id: 'a1', name: 'Reviewer', enabled: true }];
    const client = new HttpApiClient({
      baseUrl: BASE_URL,
      fetch: makeFetch({ ok: true, status: 200, body: agents }),
    });

    const result = await client.listAgents();

    expect(result).toEqual(agents);
  });

  it('returns a parsed ReviewRunResponse for runReview', async () => {
    const response = { pr_id: 'pr-1', runs: [], reviews: [] };
    const client = new HttpApiClient({
      baseUrl: BASE_URL,
      fetch: makeFetch({ ok: true, status: 200, body: response }),
    });

    const result = await client.runReview('pr-1', 'agent-1');

    expect(result).toEqual(response);
  });
});

// ---------------------------------------------------------------------------
// (b) Correct method, URL, and body are sent
// ---------------------------------------------------------------------------

describe('HttpApiClient — request shape', () => {
  it('sends the correct method, URL, and JSON body for runReview', async () => {
    let capturedUrl: string | URL | undefined;
    let capturedInit: RequestInit | undefined;

    const spyFetch = async (
      url: string | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      capturedUrl = url;
      capturedInit = init;
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ pr_id: 'pr-uuid', runs: [], reviews: [] }),
      } as unknown as Response;
    };

    const client = new HttpApiClient({
      baseUrl: BASE_URL,
      fetch: spyFetch as typeof globalThis.fetch,
    });

    await client.runReview('pr-uuid', 'agent-id');

    expect(capturedUrl).toBe(`${BASE_URL}/pulls/pr-uuid/review`);
    expect(capturedInit?.method).toBe('POST');
    // Content-Type header must be set for bodies
    const headers = capturedInit?.headers as Record<string, string> | undefined;
    expect(headers?.['Content-Type']).toBe('application/json');
    // Body must carry agentId
    const bodyStr = capturedInit?.body as string | undefined;
    expect(JSON.parse(bodyStr ?? '{}')).toEqual({ agentId: 'agent-id' });
  });

  it('sends GET with no Content-Type for listRepos', async () => {
    let capturedInit: RequestInit | undefined;

    const spyFetch = async (
      _url: string | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      capturedInit = init;
      return {
        ok: true,
        status: 200,
        json: async () => [],
      } as unknown as Response;
    };

    const client = new HttpApiClient({
      baseUrl: BASE_URL,
      fetch: spyFetch as typeof globalThis.fetch,
    });

    await client.listRepos();

    expect(capturedInit?.method).toBe('GET');
    const headers = capturedInit?.headers as Record<string, string> | undefined;
    expect(headers?.['Content-Type']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// (c) Non-2xx with ApiErrorBody envelope → ApiError
// ---------------------------------------------------------------------------

describe('HttpApiClient — API errors', () => {
  it('throws ApiError with code/message/status from the error envelope', async () => {
    const errorBody = {
      error: { code: 'NOT_FOUND', message: 'PR not found' },
    };
    const client = new HttpApiClient({
      baseUrl: BASE_URL,
      fetch: makeFetch({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        body: errorBody,
      }),
    });

    const err = await client.listRuns('bad-id').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.code).toBe('NOT_FOUND');
    expect(apiErr.message).toBe('PR not found');
    expect(apiErr.status).toBe(404);
  });

  it('falls back to status text when the body is not an error envelope', async () => {
    const client = new HttpApiClient({
      baseUrl: BASE_URL,
      fetch: makeFetch({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        body: { unexpected: 'shape' },
      }),
    });

    const err = await client.listRepos().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.status).toBe(500);
    expect(apiErr.code).toBe('HTTP_500');
    // message falls back to statusText
    expect(apiErr.message).toBe('Internal Server Error');
  });
});

// ---------------------------------------------------------------------------
// (d) fetch rejection → NetworkError
// ---------------------------------------------------------------------------

describe('HttpApiClient — network errors', () => {
  it('throws NetworkError when fetch itself rejects', async () => {
    const rejectingFetch = async (): Promise<Response> => {
      throw new TypeError('fetch failed');
    };

    const client = new HttpApiClient({
      baseUrl: BASE_URL,
      fetch: rejectingFetch as typeof globalThis.fetch,
    });

    const err = await client.listRepos().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(NetworkError);
    expect((err as NetworkError).message).toContain(BASE_URL);
  });

  it('NetworkError message hints at running the server', async () => {
    const rejectingFetch = async (): Promise<Response> => {
      throw new Error('connection refused');
    };

    const client = new HttpApiClient({
      baseUrl: 'http://localhost:9999',
      fetch: rejectingFetch as typeof globalThis.fetch,
    });

    const err = await client.listAgents().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(NetworkError);
    expect((err as NetworkError).message).toContain('pnpm dev');
  });
});
