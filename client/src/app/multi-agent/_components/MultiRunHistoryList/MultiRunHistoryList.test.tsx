import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/multiAgentReview.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

const mutateAsync = vi.fn().mockResolvedValue({ id: "run-new" });
vi.mock("@/lib/hooks/multiAgent", () => ({
  useMultiRunHistory: () => ({
    data: [
      { id: "run-2", ran_at: "2026-01-02T00:00:00Z", agent_count: 2, total_duration_ms: 6000, total_cost_usd: 0.1 },
      { id: "run-1", ran_at: "2026-01-01T00:00:00Z", agent_count: 3, total_duration_ms: 8200, total_cost_usd: 0.2 },
    ],
    isLoading: false,
  }),
  useStartMultiRun: () => ({ mutateAsync, isPending: false }),
}));

import { MultiRunHistoryList } from "./MultiRunHistoryList";

afterEach(() => {
  cleanup();
  mutateAsync.mockClear();
  push.mockClear();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ multiAgentReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("MultiRunHistoryList", () => {
  it("AC-25: lists the PR's past multi-runs newest-first, each opening its own results page by id", () => {
    renderWithIntl(<MultiRunHistoryList prId="pr-1" agentIds={["a1", "a2"]} />);

    const rows = screen.getAllByRole("button", { name: /agents ·/i });
    expect(rows).toHaveLength(2);

    fireEvent.click(rows[0]!);
    expect(push).toHaveBeenCalledWith("/multi-agent/runs/run-2");

    fireEvent.click(rows[1]!);
    expect(push).toHaveBeenCalledWith("/multi-agent/runs/run-1");
  });

  it("AC-23: the re-run control disables while its launch is in flight, so a double-click fires start exactly once", async () => {
    renderWithIntl(<MultiRunHistoryList prId="pr-1" agentIds={["a1", "a2"]} />);

    const rerunButton = screen.getByRole("button", { name: "Re-run" });
    fireEvent.click(rerunButton);
    fireEvent.click(rerunButton);

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    // Let the (mocked, instantly-resolved) mutation settle inside act() before
    // the test exits, so the post-launch state update doesn't warn.
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/multi-agent/runs/run-new"));
  });
});
