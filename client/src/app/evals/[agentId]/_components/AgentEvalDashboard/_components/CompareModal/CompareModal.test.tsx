import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCompare } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/evals.json";
import { CompareModal } from "./CompareModal";

// Control the hook directly so the test is hermetic (no fetch/QueryClient).
vi.mock("@/lib/hooks/evals", () => ({ useEvalCompare: vi.fn() }));
import { useEvalCompare } from "@/lib/hooks/evals";

afterEach(cleanup);

const COMPARE: EvalCompare = {
  a: {
    group_id: "grp-a",
    agent_version: 2,
    ran_at: "2026-06-01T10:00:00.000Z",
    recall: 0.7,
    precision: 0.8,
    citation_accuracy: 0.9,
    traces_passed: 7,
    traces_total: 10,
    cost_usd: 0.05,
  },
  b: {
    group_id: "grp-b",
    agent_version: 3,
    ran_at: "2026-07-01T10:00:00.000Z",
    recall: 0.85,
    precision: 0.78,
    citation_accuracy: 0.9,
    traces_passed: 9,
    traces_total: 10,
    cost_usd: 0.03,
  },
  delta: {
    recall: 0.15,
    precision: -0.02,
    citation_accuracy: 0,
    cost_usd: -0.02,
  },
  a_system_prompt: "You are a reviewer. <script>alert(1)</script>",
  b_system_prompt: "You are a careful reviewer. <script>alert(2)</script>",
};

function setHook(over: Record<string, unknown>) {
  vi.mocked(useEvalCompare).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...over,
  } as unknown as ReturnType<typeof useEvalCompare>);
}

function renderModal() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ evals: messages }}>
      <CompareModal groupA="grp-a" groupB="grp-b" onClose={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

describe("CompareModal", () => {
  it("renders both system prompt snapshots as plain text and deltas by icon+text, not color alone", () => {
    setHook({ data: COMPARE });
    renderModal();

    // both system prompts shown verbatim, as PLAIN TEXT (never parsed as HTML)
    expect(screen.getByText("You are a reviewer. <script>alert(1)</script>")).toBeInTheDocument();
    expect(screen.getByText("You are a careful reviewer. <script>alert(2)</script>")).toBeInTheDocument();
    expect(document.querySelectorAll("script")).toHaveLength(0);

    // recall improved (+15%) -> "Improved" text label, not just a colored number
    expect(screen.getByText("Improved (15%)")).toBeInTheDocument();
    // precision regressed (-2%) -> "Regressed" text label
    expect(screen.getByText("Regressed (2%)")).toBeInTheDocument();
    // citation unchanged -> "No change"
    expect(screen.getByText("No change")).toBeInTheDocument();
  });

  it("shows an error state on failure", () => {
    setHook({ isError: true });
    renderModal();
    expect(screen.getByText("Couldn't load this comparison.")).toBeInTheDocument();
  });
});
