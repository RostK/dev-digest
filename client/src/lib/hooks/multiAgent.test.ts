/* multiAgent.test.ts — wire-level regression test for useAgentEstimates (SPEC-06).
   Guards the bug where GET /multi-agent/estimates returns a BARE AgentEstimate[]
   but the hook/consumers expected a {agents, summary} object, so every agent
   silently rendered "no history". These tests mock `fetch` at the WIRE level
   (not the hook) so the real response shape is exercised. */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAgentEstimates } from "./multiAgent";

const fetchMock = vi.fn();

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => body,
  } as Response;
}

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useAgentEstimates (wire shape)", () => {
  it("returns the parsed AgentEstimate[] from a bare-array wire response", async () => {
    const wire = [
      { agent_id: "a1", duration_ms: 4000, cost_usd: 0.05, has_history: true },
      { agent_id: "a2", duration_ms: null, cost_usd: null, has_history: false },
    ];
    fetchMock.mockResolvedValue(jsonResponse(wire));

    const { result } = renderHook(() => useAgentEstimates(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(Array.isArray(result.current.data)).toBe(true);
    expect(result.current.data).toEqual(wire);
    // the has_history agent must survive so callers can render a real estimate
    expect(result.current.data?.find((e) => e.agent_id === "a1")?.has_history).toBe(true);
  });

  it("degrades to [] on a malformed (non-array) payload — never a fabricated number", async () => {
    // the OLD wrong shape: an object, not an array. safeParse fails → [].
    fetchMock.mockResolvedValue(jsonResponse({ agents: [], summary: {} }));

    const { result } = renderHook(() => useAgentEstimates(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});
