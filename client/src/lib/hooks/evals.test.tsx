/* evals.test.ts — smoke test for the eval-pipeline hooks (T6/T7, AC-12 client half).
   Mocks the api layer (no real fetch) and asserts useCreateEvalFromFinding posts
   the finding id to the finding-centric URL and invalidates the eval-cases
   query family. */
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

describe("useCreateEvalFromFinding", () => {
  it("POSTs the finding id to /eval-cases/from-finding and invalidates the eval-cases family", async () => {
    vi.mocked(api.post).mockResolvedValue(CASE);

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const wrapperWithQc = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useCreateEvalFromFinding(), {
      wrapper: wrapperWithQc,
    });

    result.current.mutate({ findingId: "finding-42" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.post).toHaveBeenCalledWith("/eval-cases/from-finding", {
      finding_id: "finding-42",
    });
    expect(result.current.data).toEqual(CASE);

    // Invalidates the eval-cases query FAMILY (any agent), via a predicate,
    // since the finding-centric hook doesn't know the owning agentId.
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ predicate: expect.any(Function) }),
    );
    const { predicate } = invalidateSpy.mock.calls[0]![0] as {
      predicate: (query: { queryKey: readonly unknown[] }) => boolean;
    };
    expect(predicate({ queryKey: ["eval-cases", "agent-1"] })).toBe(true);
    expect(predicate({ queryKey: ["eval-runs", "agent-1"] })).toBe(false);
  });
});
