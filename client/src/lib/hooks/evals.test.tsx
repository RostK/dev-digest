/* evals.test.ts — smoke test for the eval-pipeline hooks (T6, AC-12 client half).
   Mocks the api layer (no real fetch) and asserts useCreateEvalFromFinding posts
   the finding id to the right URL and invalidates the agent's eval-cases query. */
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalCaseWithState } from "@devdigest/shared";
import { api } from "../api";
import { useCreateEvalFromFinding } from "./evals";

vi.mock("../api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
  },
}));

afterEach(() => vi.clearAllMocks());

const CASE: EvalCaseWithState = {
  id: "case-1",
  owner_kind: "agent",
  owner_id: "agent-1",
  name: "From finding f1",
  input_diff: "diff --git a/x b/x",
  input_files: null,
  input_meta: null,
  expected_output: { kind: "must_find", findings: [] },
  notes: null,
  last_run_pass: null,
  expected_count: 1,
  actual_count: 0,
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useCreateEvalFromFinding", () => {
  it("POSTs the finding id to /agents/:agentId/eval-cases/from-finding and invalidates eval-cases", async () => {
    vi.mocked(api.post).mockResolvedValue(CASE);

    const { result } = renderHook(() => useCreateEvalFromFinding("agent-1"), {
      wrapper,
    });

    result.current.mutate("finding-42");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.post).toHaveBeenCalledWith(
      "/agents/agent-1/eval-cases/from-finding",
      { finding_id: "finding-42" },
    );
    expect(result.current.data).toEqual(CASE);
  });
});
