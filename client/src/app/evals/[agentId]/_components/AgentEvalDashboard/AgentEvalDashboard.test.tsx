import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalDashboard, EvalRunGroup, EvalCompare } from "@devdigest/shared";
import messages from "../../../../../../messages/en/evals.json";
import { AgentEvalDashboard } from "./AgentEvalDashboard";

// Control the hooks directly so the test is hermetic (no fetch/QueryClient).
vi.mock("@/lib/hooks/evals", () => ({
  useAgentEvalDashboard: vi.fn(),
  useAgentEvalRuns: vi.fn(),
  useEvalCompare: vi.fn(),
}));
import { useAgentEvalDashboard, useAgentEvalRuns, useEvalCompare } from "@/lib/hooks/evals";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: React.ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

const DASHBOARD: EvalDashboard = {
  owner_kind: "agent",
  owner_id: "ag1",
  cases_total: 10,
  current: { recall: 0.82, precision: 0.9, citation_accuracy: 0.95, traces_passed: 9, traces_total: 10, cost_usd: 0.03 },
  delta: { recall: 0.05, precision: -0.01, citation_accuracy: 0 },
  trend: [
    { ran_at: "2026-06-01T10:00:00.000Z", recall: 0.7, precision: 0.85, citation_accuracy: 0.9, pass_rate: 0.8, cost_usd: 0.02 },
    { ran_at: "2026-07-01T10:00:00.000Z", recall: 0.82, precision: 0.9, citation_accuracy: 0.95, pass_rate: 0.9, cost_usd: 0.03 },
  ],
  recent_runs: [],
  alert: null,
};

const RUNS: EvalRunGroup[] = [
  {
    group_id: "grp-a",
    agent_version: 2,
    ran_at: "2026-06-01T10:00:00.000Z",
    recall: 0.7,
    precision: 0.85,
    citation_accuracy: 0.9,
    traces_passed: 8,
    traces_total: 10,
    cost_usd: 0.02,
  },
  {
    group_id: "grp-b",
    agent_version: 3,
    ran_at: "2026-07-01T10:00:00.000Z",
    recall: 0.82,
    precision: 0.9,
    citation_accuracy: 0.95,
    traces_passed: 9,
    traces_total: 10,
    cost_usd: 0.03,
  },
];

const COMPARE: EvalCompare = {
  a: RUNS[0]!,
  b: RUNS[1]!,
  delta: { recall: 0.12, precision: 0.05, citation_accuracy: 0.05, cost_usd: 0.01 },
  a_system_prompt: "prompt A",
  b_system_prompt: "prompt B",
};

function setDashboardHook(over: Record<string, unknown>) {
  vi.mocked(useAgentEvalDashboard).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...over,
  } as unknown as ReturnType<typeof useAgentEvalDashboard>);
}

function setRunsHook(over: Record<string, unknown>) {
  vi.mocked(useAgentEvalRuns).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...over,
  } as unknown as ReturnType<typeof useAgentEvalRuns>);
}

function setCompareHook(over: Record<string, unknown>) {
  vi.mocked(useEvalCompare).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...over,
  } as unknown as ReturnType<typeof useEvalCompare>);
}

function renderDashboard() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ evals: messages }}>
      <AgentEvalDashboard agentId="ag1" />
    </NextIntlClientProvider>,
  );
}

describe("AgentEvalDashboard", () => {
  it("renders the metric trend and the recent-runs table", () => {
    setDashboardHook({ data: DASHBOARD });
    setRunsHook({ data: RUNS });
    renderDashboard();

    // trend section present
    expect(screen.getByText("Metric trend")).toBeInTheDocument();
    // recent runs table rows
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("v3")).toBeInTheDocument();
    expect(screen.getByText("8/10")).toBeInTheDocument();
    expect(screen.getByText("9/10")).toBeInTheDocument();
  });

  it("selects two runs and opens a working Compare modal showing both system prompts as a diff with icon+text deltas", () => {
    setDashboardHook({ data: DASHBOARD });
    setRunsHook({ data: RUNS });
    setCompareHook({ data: COMPARE });
    renderDashboard();

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    fireEvent.click(checkboxes[0]!);
    fireEvent.click(checkboxes[1]!);

    const compareBtn = screen.getByRole("button", { name: /compare selected/i });
    expect(compareBtn).not.toBeDisabled();
    fireEvent.click(compareBtn);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("prompt A")).toBeInTheDocument();
    expect(within(dialog).getByText("prompt B")).toBeInTheDocument();
    // deltas shown by icon + text, not color alone
    expect(within(dialog).getAllByText(/Improved/).length).toBeGreaterThan(0);
  });

  it("shows an empty state when the agent has no eval cases", () => {
    setDashboardHook({ data: { ...DASHBOARD, cases_total: 0, trend: [], alert: null } });
    setRunsHook({ data: [] });
    renderDashboard();
    expect(screen.getByText("No eval runs yet")).toBeInTheDocument();
  });

  it("shows an error state on failure", () => {
    setDashboardHook({ isError: true });
    setRunsHook({ data: [] });
    renderDashboard();
    expect(screen.getByText("Couldn't load this agent's eval dashboard.")).toBeInTheDocument();
  });
});
