/**
 * list_agents tool — lists all configured reviewer agents.
 *
 * Architecture (onion):
 *   handler depends on ApiClient (port), never on HttpApiClient (adapter).
 *   `registerListAgents` is the thin wiring point; tests call `listAgentsHandler`
 *   directly with a fake ApiClient — no server, no fetch.
 */

import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTool } from '../register.js';
import type { ApiClient } from '../api-client.js';
import { ApiError, NetworkError } from '../api-client.js';
import { ForwardError } from '../errors.js';
import { toAgentRef } from '../format.js';

// ---------------------------------------------------------------------------
// Deps type (no secrets — local API is no-auth)
// ---------------------------------------------------------------------------

export interface HandlerDeps {
  client: ApiClient;
  config: { apiUrl: string };
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

export async function listAgentsHandler(
  deps: HandlerDeps,
): Promise<CallToolResult> {
  try {
    const agents = await deps.client.listAgents();
    if (agents.length === 0) {
      return ok(
        'no agents configured — create one in DevDigest, then call list_agents again.',
        { agents: [] },
      );
    }
    const agentRefs = agents.map(toAgentRef);
    return ok(JSON.stringify({ agents: agentRefs }, null, 2), { agents: agentRefs });
  } catch (err) {
    return catchToResult(err, deps.config.apiUrl);
  }
}

// ---------------------------------------------------------------------------
// Register wrapper — called by server.ts at startup
// ---------------------------------------------------------------------------

export function registerListAgents(server: McpServer, deps: HandlerDeps): void {
  registerTool(
    server,
    'list_agents',
    {
      title: 'List review agents',
      description:
        'List the configured reviewer agents with their id, name, model, description, and enabled state. Call this first to get a valid agent id for run_agent_on_pull_request.',
      outputSchema: {
        agents: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            model: z.string(),
            description: z.string(),
            enabled: z.boolean(),
          }),
        ),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async () => listAgentsHandler(deps),
  );
}
