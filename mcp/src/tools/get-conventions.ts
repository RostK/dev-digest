/**
 * get_conventions tool — lists stored coding conventions for a repository.
 *
 * Architecture (onion):
 *   handler depends on ApiClient port + resolveRepo helper.
 *   `registerGetConventions` is the thin wiring; tests call `getConventionsHandler` directly.
 */

import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTool } from '../register.js';
import type { ApiClient } from '../api-client.js';
import { ApiError, NetworkError } from '../api-client.js';
import { ForwardError } from '../errors.js';
import { resolveRepo } from '../resolve.js';
import { toConvention } from '../format.js';

// ---------------------------------------------------------------------------
// Deps type
// ---------------------------------------------------------------------------

export interface HandlerDeps {
  client: ApiClient;
  config: { apiUrl: string };
}

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

export interface GetConventionsInput {
  repo: string;
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

export async function getConventionsHandler(
  deps: HandlerDeps,
  input: GetConventionsInput,
): Promise<CallToolResult> {
  try {
    const { repo } = input;
    const repoRecord = await resolveRepo(deps.client, repo);
    const conventions = await deps.client.listConventions(repoRecord.id);

    if (conventions.length === 0) {
      return ok(
        `no conventions stored for "${repo}" yet — extract them in DevDigest first.`,
        { conventions: [] },
      );
    }

    const conventionRefs = conventions.map(toConvention);
    return ok(
      JSON.stringify({ conventions: conventionRefs }, null, 2),
      { conventions: conventionRefs as unknown[] } as Record<string, unknown>,
    );
  } catch (err) {
    return catchToResult(err, deps.config.apiUrl);
  }
}

// ---------------------------------------------------------------------------
// Register wrapper — called by server.ts at startup
// ---------------------------------------------------------------------------

export function registerGetConventions(server: McpServer, deps: HandlerDeps): void {
  registerTool(
    server,
    'get_conventions',
    {
      title: 'Get repository conventions',
      description:
        'List a repository\'s stored coding conventions (category, rule, and where each is evidenced in the code).',
      inputSchema: {
        repo: z
          .string()
          .describe('Repository as "owner/name", e.g. acme/payments-api.'),
      },
      outputSchema: {
        conventions: z.array(
          z.object({
            category: z.string(),
            rule: z.string(),
            evidence_path: z.string(),
            evidence_start_line: z.number().nullable().optional(),
            evidence_end_line: z.number().nullable().optional(),
            accepted: z.boolean(),
          }),
        ),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (args) => getConventionsHandler(deps, args),
  );
}
