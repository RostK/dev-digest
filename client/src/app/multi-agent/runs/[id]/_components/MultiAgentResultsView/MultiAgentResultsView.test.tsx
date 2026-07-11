import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { MultiAgentRun, ReviewRecord, RunEvent } from "@devdigest/shared";
import reviewMessages from "../../../../../../../messages/en/multiAgentReview.json";
import findingsMessages from "../../../../../../../messages/en/multiAgentFindings.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

// The real AppShell renders the full sidebar/topbar chrome (its own hooks +
// i18n namespaces) — irrelevant here (mirrors ConfigureRunView.test.tsx).
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// RunTraceDrawer's OWN internals (useRunTrace, its own SSE subscription) are
// already covered by RunTraceDrawer.test.tsx — here we only need to prove
// MOUNTING with the right run_id (AC-21), so stub it to a thin marker.
vi.mock("@/components/RunTraceDrawer", () => ({
  default: ({ runId, onClose }: { runId: string; onClose: () => void }) => (
    <div data-testid="trace-drawer" data-run-id={runId}>
      <button type="button" onClick={onClose}>
        close-trace
      </button>
    </div>
  ),
}));

const refetch = vi.fn();
const mockUseMultiRun = vi.fn();
const mockUseRunEvents = vi.fn((_runIds: string[]) => ({ events: [] as RunEvent[], running: false }));

const startMutateAsync = vi.fn().mockResolvedValue({ id: "run-2" });
vi.mock("@/lib/hooks/multiAgent", () => ({
  useMultiRun: (id: string) => mockUseMultiRun(id),
  useMultiRunHistory: () => ({ data: [], isLoading: false }),
  useStartMultiRun: () => ({ mutateAsync: startMutateAsync, isPending: false }),
}));

const REVIEWS: ReviewRecord[] = [
  {
    id: "rev1",
    pr_id: "pr-1",
    agent_id: "a2",
    run_id: "r2",
    agent_name: "Performance",
    kind: "review",
    verdict: "approve",
    summary: "Looks fine overall.",
    score: 82,
    model: "gpt-4.1",
    grounding: "1/1 passed",
    created_at: "2026-01-01T00:00:00Z",
    findings: [
      {
        id: "f1",
        review_id: "rev1",
        severity: "WARNING",
        category: "perf",
        title: "N+1 query",
        file: "src/db.ts",
        start_line: 10,
        end_line: 10,
        rationale: "This loop issues one query per row.",
        suggestion: "Batch the queries.",
        confidence: 0.8,
        kind: null,
        accepted_at: null,
        dismissed_at: null,
      },
    ],
  },
];

vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: REVIEWS }),
  useRunEvents: (runIds: string[]) => mockUseRunEvents(runIds),
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { MultiAgentResultsView } from "./MultiAgentResultsView";

// jsdom doesn't implement scrollIntoView; the focus-scroll effect calls it.
Element.prototype.scrollIntoView = vi.fn();

afterEach(() => {
  cleanup();
  mockUseMultiRun.mockReset();
  mockUseRunEvents.mockReset();
  mockUseRunEvents.mockReturnValue({ events: [], running: false });
  push.mockClear();
  refetch.mockClear();
  startMutateAsync.mockClear();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ multiAgentReview: reviewMessages, multiAgentFindings: findingsMessages }}
    >
      {ui}
    </NextIntlClientProvider>,
  );
}

function baseColumn(overrides: Partial<MultiAgentRun["columns"][number]> = {}) {
  return {
    run_id: "r1",
    agent_id: "a1",
    agent_name: "Security",
    provider: "openai",
    model: "gpt-4.1",
    status: "done" as const,
    verdict: "approve",
    score: 70,
    summary: "No major issues.",
    duration_ms: 4000,
    cost_usd: 0.05,
    findings: [],
    ...overrides,
  };
}

const RUN_SETTLED: MultiAgentRun = {
  id: "run-1",
  pr_id: "pr-1",
  pr_number: 42,
  ran_at: "2026-01-01T00:00:00Z",
  agent_count: 2,
  total_duration_ms: 6000,
  total_cost_usd: 0.13,
  columns: [
    baseColumn(),
    baseColumn({
      run_id: "r2",
      agent_id: "a2",
      agent_name: "Performance",
      status: "done",
      score: 82,
      summary: "Looks fine overall.",
      duration_ms: 6000,
      cost_usd: 0.08,
      findings: [
        { id: "f1", severity: "WARNING", category: "perf", title: "N+1 query", file: "src/db.ts", start_line: 10, kind: null },
      ],
    }),
  ],
  conflicts: [],
};

const RUN_WITH_RUNNING: MultiAgentRun = {
  ...RUN_SETTLED,
  columns: [
    baseColumn({ status: "running", verdict: null, score: null, summary: null, duration_ms: null, cost_usd: null }),
    baseColumn({
      run_id: "r2",
      agent_id: "a2",
      agent_name: "Performance",
      status: "done",
      score: 82,
      summary: "Looks fine overall.",
      duration_ms: 6000,
      cost_usd: 0.08,
    }),
  ],
};

function mockRun(run: MultiAgentRun) {
  mockUseMultiRun.mockReturnValue({ data: run, isLoading: false, isError: false, error: null, refetch });
}

describe("MultiAgentResultsView", () => {
  it("AC-12: toggling Columns↔Tabs re-renders the same agents in both layouts", () => {
    mockRun(RUN_SETTLED);
    renderWithIntl(<MultiAgentResultsView runId="run-1" />);

    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByText("Performance")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tabs" }));

    expect(screen.getByRole("tab", { name: /Security/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Performance/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Columns" }));
    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByText("Performance")).toBeInTheDocument();
  });

  it("AC-10: mocked SSE events flip a running column to done, and only subscribes to the running run_id", () => {
    mockRun(RUN_WITH_RUNNING);
    mockUseRunEvents.mockReturnValue({
      events: [{ runId: "r1", seq: 1, kind: "result", msg: "done", t: "00.10" }],
      running: true,
    });

    renderWithIntl(<MultiAgentResultsView runId="run-1" />);

    expect(mockUseRunEvents).toHaveBeenCalledWith(["r1"]);
    expect(screen.getAllByText("Done")).toHaveLength(2);
    expect(screen.queryByText("Running")).not.toBeInTheDocument();
  });

  it("AC-11: a run failure yields a failed column with no score while the sibling proceeds unaffected", () => {
    mockRun(RUN_WITH_RUNNING);
    mockUseRunEvents.mockReturnValue({
      events: [{ runId: "r1", seq: 1, kind: "error", msg: "boom", t: "00.10" }],
      running: true,
    });

    renderWithIntl(<MultiAgentResultsView runId="run-1" />);

    expect(screen.getByText("Failed")).toBeInTheDocument();
    // Sibling (r2) is unaffected: still done, still shows its score.
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.getByText("82/100")).toBeInTheDocument();
    // The failed column has NO score badge (null score) — only one "/100" left.
    expect(screen.getAllByText(/\/100/)).toHaveLength(1);
  });

  it("AC-21: 'View trace' in both Columns and Tabs modes mounts RunTraceDrawer with that agent's run_id", () => {
    mockRun(RUN_SETTLED);
    renderWithIntl(<MultiAgentResultsView runId="run-1" />);

    fireEvent.click(screen.getAllByRole("button", { name: "View trace" })[0]!);
    expect(screen.getByTestId("trace-drawer")).toHaveAttribute("data-run-id", "r1");

    fireEvent.click(screen.getByText("close-trace"));
    expect(screen.queryByTestId("trace-drawer")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tabs" }));
    fireEvent.click(screen.getByRole("button", { name: "View trace" }));
    expect(screen.getByTestId("trace-drawer")).toHaveAttribute("data-run-id", "r1");

    fireEvent.click(screen.getByRole("tab", { name: /Performance/i }));
    fireEvent.click(screen.getByRole("button", { name: "View trace" }));
    expect(screen.getByTestId("trace-drawer")).toHaveAttribute("data-run-id", "r2");
  });

  it("AC-13: clicking a Columns finding jumps to that agent's Tabs detail with the finding expanded", () => {
    mockRun(RUN_SETTLED);
    renderWithIntl(<MultiAgentResultsView runId="run-1" />);

    // Columns view (default): the Performance column's finding row is a button.
    fireEvent.click(screen.getByRole("button", { name: /N\+1 query/i }));

    // Now in Tabs, the Performance tab is active and the finding is expanded
    // (its rationale — only rendered in the expanded card body — is visible).
    expect(screen.getByRole("tab", { name: /Performance/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("This loop issues one query per row.")).toBeInTheDocument();
  });

  it("AC-15 (smoke): renders the 'Where agents disagree' conflicts block", () => {
    mockRun({
      ...RUN_SETTLED,
      conflicts: [
        {
          file: "src/db.ts",
          line: 10,
          title: "N+1 query pattern",
          takes: [
            { agent_id: "a1", persona: "Security", verdict: "ignored", note: "Reviewed but did not flag." },
            { agent_id: "a2", persona: "Performance", verdict: "WARNING", note: "Confirmed a hot-path N+1." },
          ],
        },
      ],
    });
    renderWithIntl(<MultiAgentResultsView runId="run-1" />);

    expect(screen.getByText("Where agents disagree")).toBeInTheDocument();
  });
});
