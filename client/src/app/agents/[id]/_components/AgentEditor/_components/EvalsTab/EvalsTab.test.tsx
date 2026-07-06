import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCaseWithState } from "@devdigest/shared";
import evalsMessages from "../../../../../../../../messages/en/evals.json";
import agentsMessages from "../../../../../../../../messages/en/agents.json";

const CASES: EvalCaseWithState[] = [
  {
    id: "case-1",
    owner_kind: "agent",
    owner_id: "ag1",
    name: "Flags a hardcoded secret",
    input_diff: "",
    input_files: null,
    input_meta: null,
    expected_output: { kind: "must_find", findings: [] },
    notes: null,
    last_run_pass: true,
    expected_count: 1,
    actual_count: 1,
  },
  {
    id: "case-2",
    owner_kind: "agent",
    owner_id: "ag1",
    name: "Ignores a safe refactor",
    input_diff: "",
    input_files: null,
    input_meta: null,
    expected_output: { kind: "must_not_flag", findings: [] },
    notes: null,
    last_run_pass: false,
    expected_count: 0,
    actual_count: 1,
  },
  {
    id: "case-3",
    owner_kind: "agent",
    owner_id: "ag1",
    name: "Never run yet",
    input_diff: "",
    input_files: null,
    input_meta: null,
    expected_output: { kind: "must_find", findings: [] },
    notes: null,
    last_run_pass: null,
    expected_count: 2,
    actual_count: 0,
  },
];

let casesData: EvalCaseWithState[] = CASES;
const runSetMutate = vi.fn();
let runSetPending = false;

vi.mock("@/lib/hooks/evals", () => ({
  useAgentEvalCases: () => ({ data: casesData }),
  useRunEvalSet: () => ({ mutate: runSetMutate, isPending: runSetPending }),
}));

import { EvalsTab } from "./EvalsTab";

afterEach(() => {
  cleanup();
  runSetMutate.mockClear();
  casesData = CASES;
  runSetPending = false;
});

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ evals: evalsMessages, agents: agentsMessages }}>
      <EvalsTab agentId="ag1" />
    </NextIntlClientProvider>,
  );
}

describe("Agent Editor Evals tab (T8)", () => {
  it("renders each case's status, expected/actual counts, shows the < 8 hint, and links to the full dashboard (AC-13, AC-14, AC-19)", () => {
    renderTab();

    expect(screen.getByText("Flags a hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("Ignores a safe refactor")).toBeInTheDocument();
    expect(screen.getByText("Never run yet")).toBeInTheDocument();

    expect(screen.getByText("Pass")).toBeInTheDocument();
    expect(screen.getByText("Fail")).toBeInTheDocument();
    expect(screen.getByText("Never run")).toBeInTheDocument();

    // 3 cases < 8 -> the min-cases hint is shown with the current count.
    expect(screen.getByText("Add at least 8 cases for a reliable signal (3/8)")).toBeInTheDocument();

    const dashboardLink = screen.getByText("View full dashboard →");
    expect(dashboardLink).toHaveAttribute("href", "/evals/ag1");
  });

  it("hides the min-cases hint at 8+ cases (AC-14) and triggers Run all", () => {
    casesData = Array.from({ length: 8 }, (_, i) => ({
      ...CASES[0]!,
      id: `case-${i}`,
      name: `Case ${i}`,
    }));
    renderTab();

    expect(screen.queryByText(/Add at least 8 cases/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Run all"));
    expect(runSetMutate).toHaveBeenCalledWith("ag1");
  });

  it("shows a running state while the eval set mutation is pending", () => {
    runSetPending = true;
    renderTab();

    expect(screen.getByText("Running…")).toBeInTheDocument();
  });
});
