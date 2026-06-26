/**
 * ApiClient — the port + adapter (onion boundary).
 *
 * The `ApiClient` INTERFACE is the PORT: all tools and helpers depend on it,
 * never on the concrete `HttpApiClient`. The `HttpApiClient` CLASS is the
 * ADAPTER: the single place in the package that calls `fetch`.
 *
 * Shared-contract types are imported with `import type` only — they erase at
 * runtime, so this package has zero runtime dependency on the tsconfig path alias.
 * All `@devdigest/shared` imports below are type-only.
 */

import { z } from 'zod';
import type { Agent, ConventionCandidate } from '@devdigest/shared';
import type { Repo, PrMeta } from '@devdigest/shared';
import type { ReviewRunResponse, ReviewRecord } from '@devdigest/shared';
import type { RunSummary } from '@devdigest/shared';

// ---------------------------------------------------------------------------
// Typed error classes (exported for use in tool handlers)
// ---------------------------------------------------------------------------

/** Thrown when the API responds with a non-2xx status. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor({
    code,
    message,
    status,
  }: {
    code: string;
    message: string;
    status: number;
  }) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

/** Thrown when `fetch` itself rejects (connection refused, DNS failure, etc.). */
export class NetworkError extends Error {
  constructor({ message, cause }: { message: string; cause?: unknown }) {
    super(message, { cause });
    this.name = 'NetworkError';
  }
}

// ---------------------------------------------------------------------------
// Port — the interface tools and helpers program against
// ---------------------------------------------------------------------------

export interface ApiClient {
  /** GET /agents — list all review agents. */
  listAgents(): Promise<Agent[]>;

  /** GET /repos — list all repos in the workspace. */
  listRepos(): Promise<Repo[]>;

  /** GET /repos/:id/pulls — list pull requests for a repo. */
  listPulls(repoId: string): Promise<PrMeta[]>;

  /** POST /pulls/:id/review { agentId } — trigger a review run (fire-and-forget). */
  runReview(prId: string, agentId: string): Promise<ReviewRunResponse>;

  /** GET /pulls/:id/runs — list run summaries for a PR, newest-first. */
  listRuns(prId: string): Promise<RunSummary[]>;

  /** GET /pulls/:id/reviews — list completed reviews for a PR. */
  listReviews(prId: string): Promise<ReviewRecord[]>;

  /** GET /repos/:id/conventions — list stored conventions for a repo. */
  listConventions(repoId: string): Promise<ConventionCandidate[]>;
}

// ---------------------------------------------------------------------------
// Local schema for parsing the API error envelope at runtime.
// Mirrors ApiErrorBody from @devdigest/shared without a runtime import.
// ---------------------------------------------------------------------------

const ApiErrorEnvelope = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

// ---------------------------------------------------------------------------
// Adapter — the only place in this package that calls fetch
// ---------------------------------------------------------------------------

/** Minimal fetch signature used by the adapter (a subset of the global fetch). */
type FetchFn = (
  url: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export class HttpApiClient implements ApiClient {
  private readonly baseUrl: string;
  private readonly _fetch: FetchFn;

  constructor({
    baseUrl,
    fetch: fetchFn,
  }: {
    baseUrl: string;
    /** Injected fetch implementation; defaults to global fetch. Tests inject a fake. */
    fetch?: FetchFn;
  }) {
    // Strip trailing slash so URL concatenation is predictable.
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this._fetch = fetchFn ?? globalThis.fetch;
  }

  // -------------------------------------------------------------------------
  // Private HTTP helper
  // -------------------------------------------------------------------------

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {};
    let serialized: string | undefined;

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      serialized = JSON.stringify(body);
    }

    let res: Response;
    try {
      res = await this._fetch(url, {
        method,
        headers,
        body: serialized,
      });
    } catch (cause) {
      throw new NetworkError({
        message:
          `Cannot reach DevDigest API at ${this.baseUrl}` +
          ` — is the server running (cd server && pnpm dev)?`,
        cause,
      });
    }

    if (!res.ok) {
      // Try to extract the structured error envelope { error: { code, message } }.
      let code = `HTTP_${res.status}`;
      let message = res.statusText || `HTTP ${res.status}`;
      try {
        const envelope = ApiErrorEnvelope.safeParse(await res.json());
        if (envelope.success) {
          code = envelope.data.error.code;
          message = envelope.data.error.message;
        }
      } catch {
        // Body unreadable — keep the status-based fallbacks.
      }
      throw new ApiError({ code, message, status: res.status });
    }

    return res.json() as Promise<T>;
  }

  // -------------------------------------------------------------------------
  // Port methods
  // -------------------------------------------------------------------------

  listAgents(): Promise<Agent[]> {
    return this.request<Agent[]>('GET', '/agents');
  }

  listRepos(): Promise<Repo[]> {
    return this.request<Repo[]>('GET', '/repos');
  }

  listPulls(repoId: string): Promise<PrMeta[]> {
    return this.request<PrMeta[]>('GET', `/repos/${repoId}/pulls`);
  }

  runReview(prId: string, agentId: string): Promise<ReviewRunResponse> {
    return this.request<ReviewRunResponse>('POST', `/pulls/${prId}/review`, {
      agentId,
    });
  }

  listRuns(prId: string): Promise<RunSummary[]> {
    return this.request<RunSummary[]>('GET', `/pulls/${prId}/runs`);
  }

  listReviews(prId: string): Promise<ReviewRecord[]> {
    return this.request<ReviewRecord[]>('GET', `/pulls/${prId}/reviews`);
  }

  listConventions(repoId: string): Promise<ConventionCandidate[]> {
    return this.request<ConventionCandidate[]>(
      'GET',
      `/repos/${repoId}/conventions`,
    );
  }
}
