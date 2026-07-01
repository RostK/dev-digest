/**
 * get_findings tool — returns the most recent completed review for a PR.
 *
 * Does NOT start a new run. Use run_agent_on_pull_request to start one first.
 *
 * Architecture (onion):
 *   handler depends on ApiClient port, resolveRepo/resolvePr helpers, and format.
 *   `registerGetFindings` is the thin wiring; tests call `getFindingsHandler` directly.
 */

import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTool } from '../register.js';
import type { ApiClient } from '../api-client.js';
import { ApiError, NetworkError } from '../api-client.js';
import { ForwardError } from '../errors.js';
import { resolveRepo, resolvePr } from '../resolve.js';
import { toVerdict } from '../format.js';

// ---------------------------------------------------------------------------
// Deps type
// ---------------------------------------------------------------------------

export interface HandlerDeps {
  client: ApiClient;
  config: { apiUrl: string };
}

// ---------------------------------------------------------------------------
// Input type (mirrors the inputSchema raw shape)
// ---------------------------------------------------------------------------

export interface GetFindingsInput {
  repo: string;
  pr: number;
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
// Shared output schema shape (also used by run-agent)
// ---------------------------------------------------------------------------

export const verdictOutputSchema = {
  verdict: z.string().nullable(),
  summary: z.string().nullable(),
  score: z.number().nullable(),
  findings_count: z.number(),
  findings: z.array(
    z.object({
      severity: z.string(),
      file: z.string(),
      start_line: z.number(),
      end_line: z.number(),
      title: z.string(),
      suggestion: z.string().nullish(),
    }),
  ),
};

// ---------------------------------------------------------------------------
// Pure handler — call directly in tests with a fake ApiClient
// ---------------------------------------------------------------------------

export async function getFindingsHandler(
  deps: HandlerDeps,
  input: GetFindingsInput,
): Promise<CallToolResult> {
  try {
    const { repo, pr } = input;
    const repoRecord = await resolveRepo(deps.client, repo);
    const prId = await resolvePr(deps.client, repoRecord.id, pr);

    const reviews = await deps.client.listReviews(prId);
    const newest = reviews[0];
    if (!newest) {
      return errResult(
        `no completed review for "${repo}" #${pr} — call run_agent_on_pull_request first.`,
      );
    }

    const verdict = toVerdict(newest);
    return ok(JSON.stringify(verdict, null, 2), verdict as unknown as Record<string, unknown>);
  } catch (err) {
    return catchToResult(err, deps.config.apiUrl);
  }
}

// ---------------------------------------------------------------------------
// Register wrapper — called by server.ts at startup
// ---------------------------------------------------------------------------

export function registerGetFindings(server: McpServer, deps: HandlerDeps): void {
  registerTool(
    server,
    'get_findings',
    {
      title: 'Get review findings',
      description:
        'Return the verdict and findings of a pull request\'s most recent completed review, without starting a new one. Use after run_agent_on_pull_request or to re-read an earlier result.',
      inputSchema: {
        repo: z
          .string()
          .describe('Repository as "owner/name", e.g. acme/payments-api.'),
        pr: z.number().int(),
      },
      outputSchema: verdictOutputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (args) => getFindingsHandler(deps, args),
  );
}
