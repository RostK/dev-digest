import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../messages/en/multiAgentConfig.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/multi-agent/configure",
}));

// The real AppShell renders the full sidebar/topbar chrome (its own hooks +
// i18n namespaces) — irrelevant to this view; render a passthrough (mirrors
// ProjectContextView.test.tsx).
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "repo1", activeRepo: null, repos: [], reposLoaded: true }),
}));

vi.mock("@/lib/hooks", () => ({
  usePulls: () => ({
    data: [{ id: "pr1", number: 42, title: "Add rate limiting", status: "open" }],
    isLoading: false,
  }),
}));

vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({
    data: [
      { id: "a1", name: "Security", model: "gpt-4.1", enabled: true },
      { id: "a2", name: "Performance", model: "gpt-4.1", enabled: true },
    ],
    isLoading: false,
  }),
}));

vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: () => ({
    data: [
      {
        id: "rev1",
        pr_id: "pr1",
        agent_id: "a1",
        run_id: "r1",
        agent_name: "Security",
        kind: "review",
        verdict: "approve",
        summary: "Looks solid, one nit.",
        score: 90,
        model: "gpt-4.1",
        created_at: "2026-01-01T00:00:00Z",
        findings: [],
      },
    ],
  }),
}));

const mutateAsync = vi.fn().mockResolvedValue({ id: "run-1" });
// The wire shape (and hence the hook's `data`) is a BARE AgentEstimate[] —
// GET /multi-agent/estimates never wraps it in {agents, summary}; the client
// aggregates the selected subset itself (Q2).
vi.mock("@/lib/hooks/multiAgent", () => ({
  useAgentEstimates: () => ({
    data: [
      { agent_id: "a1", duration_ms: 4000, cost_usd: 0.05, has_history: true },
      { agent_id: "a2", duration_ms: null, cost_usd: null, has_history: false },
    ],
  }),
  useStartMultiRun: () => ({ mutateAsync, isPending: false }),
}));

import { ConfigureRunView } from "./ConfigureRunView";

afterEach(() => {
  cleanup();
  mutateAsync.mockClear();
  push.mockClear();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ multiAgentConfig: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("ConfigureRunView", () => {
  it("AC-3: once a PR is selected, lists agent cards with a last-run summary + estimate, Select all checks every card, and the run button + summary reflect the selection; AC-6: the partial (≥ ≈…) form appears when a selected agent lacks history", () => {
    renderWithIntl(<ConfigureRunView />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "pr1" } });

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    expect(screen.getByText("Looks solid, one nit.")).toBeInTheDocument();
    expect(screen.getByText("No runs yet on this PR")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Select all"));
    for (const cb of checkboxes) expect(cb).toHaveAttribute("aria-checked", "true");

    expect(screen.getByText("Run multi-agent review (2)")).toBeInTheDocument();
    // AC-6: agent a2 has no history, so the summary is partial (≥ ≈…), never fabricated.
    expect(screen.getByText("≥ ≈ 4.0s · $0.05 · parallel fan-out")).toBeInTheDocument();
  });

  it("AC-4: while no pull request is selected, shows the step-2 placeholder and keeps the run button non-actionable", () => {
    renderWithIntl(<ConfigureRunView />);

    expect(screen.getByText("Pick a pull request first …")).toBeInTheDocument();

    const runButton = screen.getByRole("button", { name: /run multi-agent review/i });
    expect(runButton).toBeDisabled();

    fireEvent.click(runButton);
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
