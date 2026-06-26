/**
 * run_agent_on_pull_request tool — creates a review run, polls until done,
 * then returns the verdict + findings in one call (Result, not operation).
 *
 * Steps:
 *   1. resolveRepo("owner/name")  → repo record
 *   2. resolvePr(repo.id, prNumber) → prId (UUID)
 *   3. resolveAgent(agentId)       → agent record
 *   4. client.runReview(prId, agent.id) → fire-and-forget, gets run_id
 *   5. waitForRun(prId, run_id, opts)   → polls until done/failed/cancelled/timeout
 *   6. client.listReviews(prId)  → pick review matching run_id (fallback newest)
 *   7. toVerdict(review)         → compact structured result
 *
 * Architecture (onion):
 *   handler depends on ApiClient port + resolve/poll/format helpers.
 *   `registerRunAgent` is the thin wiring; tests call `runAgentHandler` directly.
 */

import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTool } from '../register.js';
import type { ApiClient } from '../api-client.js';
import { ApiError, NetworkError } from '../api-client.js';
import { ForwardError } from '../errors.js';
import { resolveRepo, resolvePr, resolveAgent } from '../resolve.js';
import { waitForRun } from '../poll.js';
import { toVerdict } from '../format.js';
import { verdictOutputSchema } from './get-findings.js';

// ---------------------------------------------------------------------------
// Deps type
// ---------------------------------------------------------------------------

export interface HandlerDeps {
  client: ApiClient;
  config: {
    apiUrl: string;
    reviewTimeoutMs: number;
    pollIntervalMs: number;
  };
}

// ---------------------------------------------------------------------------
// Input type (mirrors the inputSchema raw shape)
// ---------------------------------------------------------------------------

export interface RunAgentInput {
  repo: string;
  pr: number;
  agent: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function errResult(text: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text }] };
}

function ok(text: string, structuredContent: Record<string, unknown>): CallToolResult {
  return { content: [{ type: 'text', text }], structuredContent };
}

function catchToResult(err: unknown, apiUrl: string): CallToolResult {
  if (err instanceof ForwardError) return errResult(err.message);
  if (err instanceof NetworkError) {
    return errResult(
      `cannot reach the DevDigest API at ${apiUrl} — is the server running (cd server && pnpm dev)?`,
    );
  }
  if (err instanceof ApiError) return errResult(`API error: ${err.message}`);
  return errResult(`unexpected error: ${err instanceof Error ? err.message : String(err)}`);
}

// ---------------------------------------------------------------------------
// Pure handler — call directly in tests with a fake ApiClient
// ---------------------------------------------------------------------------

export async function runAgentHandler(
  deps: HandlerDeps,
  input: RunAgentInput,
): Promise<CallToolResult> {
  try {
    const { repo, pr, agent } = input;

    // Step 1-3: resolve identifiers to UUIDs
    const repoRecord = await resolveRepo(deps.client, repo);
    const prId = await resolvePr(deps.client, repoRecord.id, pr);
    const agentRecord = await resolveAgent(deps.client, agent);

    // Step 4: fire the review (fire-and-forget — returns immediately with run_id)
    const runResponse = await deps.client.runReview(prId, agentRecord.id);
    const firstRun = runResponse.runs[0];
    if (!firstRun) {
      return errResult(
        'review did not start — the API returned no run id. Retry run_agent_on_pull_request.',
      );
    }
    const runId = firstRun.run_id;

    // Step 5: poll until terminal status
    // waitForRun throws ForwardError on failed/cancelled/timeout — caught below.
    await waitForRun(deps.client, prId, runId, {
      intervalMs: deps.config.pollIntervalMs,
      timeoutMs: deps.config.reviewTimeoutMs,
    });

    // Step 6: fetch completed review
    const reviews = await deps.client.listReviews(prId);

    // Prefer the review whose run_id matches; fall back to newest (index 0) if
    // run_id is null/unmatched (can happen with older server versions).
    const matched = reviews.find(r => r.run_id === runId);
    const review = matched ?? reviews[0];

    if (!review) {
      return errResult(
        'run completed but no review was found — call get_findings shortly.',
      );
    }

    // Step 7: map to concise verdict
    const verdict = toVerdict(review);
    return ok(JSON.stringify(verdict, null, 2), verdict as unknown as Record<string, unknown>);
  } catch (err) {
    return catchToResult(err, deps.config.apiUrl);
  }
}

// ---------------------------------------------------------------------------
// Register wrapper — called by server.ts at startup
// ---------------------------------------------------------------------------

export function registerRunAgent(server: McpServer, deps: HandlerDeps): void {
  registerTool(
    server,
    'run_agent_on_pull_request',
    {
      title: 'Review a pull request',
      description:
        'Review a pull request and return its findings. Creates the run, waits for it to finish, and returns the verdict plus findings in one call.',
      inputSchema: {
        repo: z
          .string()
          .describe('Repository as "owner/name", e.g. acme/payments-api.'),
        pr: z.number().int(),
        agent: z.string().describe('Agent id from list_agents.'),
      },
      outputSchema: verdictOutputSchema,
      annotations: { readOnlyHint: false },
    },
    async (args) => runAgentHandler(deps, args),
  );
}
