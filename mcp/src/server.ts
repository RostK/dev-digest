/**
 * server.ts — merge point for all tool registrations.
 *
 * Constructs the McpServer and wires all 5 tools into it.
 * This is the ONLY file that imports all five tool registrars.
 *
 * Architecture (onion):
 *   createServer is called by index.ts (the composition root), which injects
 *   the concrete HttpApiClient. This file depends only on the ApiClient port.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from './api-client.js';
import { registerListAgents } from './tools/list-agents.js';
import { registerRunAgent } from './tools/run-agent.js';
import { registerGetFindings } from './tools/get-findings.js';
import { registerGetConventions } from './tools/get-conventions.js';
import { registerGetBlastRadius } from './tools/get-blast-radius.js';

// ---------------------------------------------------------------------------
// Deps type — the superset config needed by all five tools.
// run_agent_on_pull_request requires reviewTimeoutMs + pollIntervalMs;
// the other tools only require apiUrl.  Structural subtyping ensures the
// wider config shape satisfies the narrower HandlerDeps on each tool.
// ---------------------------------------------------------------------------

export interface ServerDeps {
  client: ApiClient;
  config: {
    apiUrl: string;
    reviewTimeoutMs: number;
    pollIntervalMs: number;
  };
}

// ---------------------------------------------------------------------------
// Server instructions (1–3 sentences, token-lean)
// ---------------------------------------------------------------------------

const INSTRUCTIONS =
  'Review pull requests in the local DevDigest instance. Call list_agents to get a valid agent id, then run_agent_on_pull_request to review a PR and get its findings.';

// ---------------------------------------------------------------------------
// createServer — called once by index.ts (the composition root)
// ---------------------------------------------------------------------------

export function createServer(deps: ServerDeps): McpServer {
  const server = new McpServer(
    { name: 'devdigest', version: '0.0.0' },
    { instructions: INSTRUCTIONS, capabilities: { tools: {} } },
  );

  registerListAgents(server, deps);
  registerRunAgent(server, deps);
  registerGetFindings(server, deps);
  registerGetConventions(server, deps);
  registerGetBlastRadius(server, deps);

  return server;
}
