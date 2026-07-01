/**
 * Non-generic registration shim for MCP tools.
 *
 * The SDK's generic `McpServer.registerTool` signature triggers a pathological
 * TypeScript instantiation: checking several tools that pass zod input/output
 * schemas together drives `tsc` to a heap OOM (and, with lighter inputs, a
 * TS2589 "type instantiation is excessively deep" error). We register through
 * this loose, non-generic VIEW of the method instead.
 *
 * Runtime behaviour is identical — the same `config` object and `handler` reach
 * the real `server.registerTool` (called as a member of `server`, so `this` is
 * preserved), which still validates inputs/outputs against the zod shapes. Only
 * the compile-time generic inference is bypassed.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export interface ToolConfig {
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

// args/extra are intentionally `any`: the SDK validates `args` at runtime against
// inputSchema, and each tool casts to its own input type inside the handler.
export type ToolHandler = (args: any, extra: any) => CallToolResult | Promise<CallToolResult>;

export function registerTool(
  server: McpServer,
  name: string,
  config: ToolConfig,
  handler: ToolHandler,
): void {
  (
    server as unknown as {
      registerTool(n: string, c: ToolConfig, h: ToolHandler): void;
    }
  ).registerTool(name, config, handler);
}
