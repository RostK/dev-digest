import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { GlobalEvalDashboard as GlobalEvalDashboardData } from "@devdigest/shared";
import messages from "../../../../../messages/en/evals.json";
import { GlobalEvalDashboard } from "./GlobalEvalDashboard";

// Control the hook directly so the test is hermetic (no fetch/QueryClient).
vi.mock("@/lib/hooks/evals", () => ({ useGlobalEvalDashboard: vi.fn() }));
import { useGlobalEvalDashboard } from "@/lib/hooks/evals";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: React.ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

const DATA: GlobalEvalDashboardData = {
  summary_rows: [
    {
      agent_id: "ag1",
      agent_name: "General Reviewer",
      agent_version: 3,
      recall: 0.82,
      precision: 0.9,
      citation_accuracy: 0.95,
      run_count: 5,
    },
  ],
  recent_runs: [
    {
      group_id: "grp1",
      agent_version: 3,
      ran_at: "2026-07-01T12:00:00.000Z",
      recall: 0.82,
      precision: 0.9,
      citation_accuracy: 0.95,
      traces_passed: 9,
      traces_total: 10,
      cost_usd: 0.012,
    },
  ],
};

function setHook(over: Record<string, unknown>) {
  vi.mocked(useGlobalEvalDashboard).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...over,
  } as unknown as ReturnType<typeof useGlobalEvalDashboard>);
}

function renderDashboard() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ evals: messages }}>
      <GlobalEvalDashboard />
    </NextIntlClientProvider>,
  );
}

describe("GlobalEvalDashboard", () => {
  it("renders per-agent summary rows linking to the agent dashboard, and recent runs across agents", () => {
    setHook({ data: DATA });
    renderDashboard();

    // per-agent summary row
    const link = screen.getByText("General Reviewer").closest("a");
    expect(link).toHaveAttribute("href", "/evals/ag1");
    expect(within(link!).getByText("v3")).toBeInTheDocument();
    expect(within(link!).getByText("82%")).toBeInTheDocument();

    // recent-runs row
    expect(screen.getByText("$0.01")).toBeInTheDocument();
  });

  it("shows an empty state when there is no eval data at all", () => {
    setHook({ data: { summary_rows: [], recent_runs: [] } });
    renderDashboard();
    expect(screen.getByText("No eval runs yet")).toBeInTheDocument();
  });

  it("shows an error state on failure", () => {
    setHook({ isError: true });
    renderDashboard();
    expect(screen.getByText("Couldn't load the eval dashboard.")).toBeInTheDocument();
  });
});
