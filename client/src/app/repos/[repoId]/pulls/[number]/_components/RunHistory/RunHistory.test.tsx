/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunSummary, FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { RunHistory } from "./RunHistory";

afterEach(cleanup);

function finding(o: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded Stripe secret key",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "x",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "rv1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

function run(o: Partial<RunSummary>): RunSummary {
  return {
    run_id: "run-1",
    agent_id: "a1",
    agent_name: "Security Reviewer",
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash",
    status: "done",
    error: null,
    duration_ms: 1000,
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: null,
    findings_count: 0,
    grounding: "0/0 passed",
    ran_at: "2026-06-11T18:44:34.000Z",
    score: null,
    blockers: null,
    ...o,
  };
}

function renderRuns(runs: RunSummary[], findingsByRunId?: Map<string, FindingRecord[]>) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunHistory runs={runs} findingsByRunId={findingsByRunId} onOpenTrace={() => {}} />
    </NextIntlClientProvider>,
  );
}

describe("RunHistory — outcome badge", () => {
  it("a done run WITH blockers reads 'rejected' (never green 'done') + shows the score ring", () => {
    renderRuns([run({ status: "done", findings_count: 5, blockers: 5, score: 0 })]);
    expect(screen.getByText("rejected")).toBeInTheDocument();
    expect(screen.queryByText("done")).not.toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument(); // CircularScore renders the number
    expect(screen.getByText(/5 blockers/)).toBeInTheDocument();
  });

  it("a clean done run reads 'approved'", () => {
    renderRuns([run({ status: "done", findings_count: 0, blockers: 0, score: 95 })]);
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByText("95")).toBeInTheDocument();
  });

  it("a done run with non-blocking findings reads 'reviewed'", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0, score: 72 })]);
    expect(screen.getByText("reviewed")).toBeInTheDocument();
    expect(screen.queryByText(/blockers/)).not.toBeInTheDocument();
  });

  it("a failed run reads 'error'", () => {
    renderRuns([run({ status: "failed", error: "boom", score: null, blockers: null })]);
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("a running run reads 'running'", () => {
    renderRuns([run({ status: "running", score: null, blockers: null })]);
    expect(screen.getByText("running")).toBeInTheDocument();
  });
});

describe("RunHistory — per-run severity cluster", () => {
  it("a settled run with findings shows the severity cluster + 'in this run' hover card", () => {
    const runFindings = [
      finding({ id: "f1", severity: "CRITICAL" }),
      finding({ id: "f2", severity: "CRITICAL", title: "SSRF in webhook forwarder" }),
      finding({ id: "f3", severity: "WARNING", category: "perf", title: "N+1 query in user list" }),
    ];
    renderRuns(
      [run({ status: "done", findings_count: 3, blockers: 2, score: 38 })],
      new Map([["run-1", runFindings]]),
    );
    // Cluster: two CRITICAL + one WARNING (open findings), blockers still shown.
    expect(screen.getByTitle("2 Critical")).toBeInTheDocument();
    expect(screen.getByTitle("1 Warning")).toBeInTheDocument();
    expect(screen.getByText(/2 blockers/)).toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByTitle("2 Critical").parentElement!.parentElement!);
    expect(screen.getByRole("dialog")).toHaveTextContent("3 findings in this run");
    expect(screen.getByText("SSRF in webhook forwarder")).toBeInTheDocument();
  });

  it("a settled run with no matching findings keeps the plain count line", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0, score: 72 })], new Map());
    expect(screen.getByText(/3 finding/)).toBeInTheDocument();
    expect(screen.queryByTitle(/Critical|Warning|Suggestion/)).not.toBeInTheDocument();
  });
});

describe("RunHistory — usage line (tokens · cost)", () => {
  it("a done run shows comma-grouped total tokens + precise cost", () => {
    renderRuns([
      run({ status: "done", tokens_in: 8000, tokens_out: 1119, cost_usd: 0.0013, score: 72, findings_count: 1 }),
    ]);
    expect(screen.getByText("9,119 tok · $0.0013")).toBeInTheDocument();
  });

  it("shows tokens but omits cost when the run is unpriced (cost_usd null)", () => {
    renderRuns([run({ status: "done", tokens_in: 100, tokens_out: 50, cost_usd: null })]);
    expect(screen.getByText("150 tok")).toBeInTheDocument();
  });

  it("a failed run shows no usage line", () => {
    renderRuns([
      run({ status: "failed", tokens_in: 0, tokens_out: 0, cost_usd: null, score: null, blockers: null }),
    ]);
    expect(screen.queryByText(/tok/)).not.toBeInTheDocument();
  });
});
