import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Brief, ReviewRecord, RunSummary } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/brief.json";
import { PrBriefCard } from "./PrBriefCard";

// Control the hooks directly so the test is hermetic (no fetch/QueryClient).
vi.mock("@/lib/hooks", () => ({ useBrief: vi.fn(), useGenerateBrief: vi.fn() }));
vi.mock("@/lib/hooks/reviews", () => ({ usePrReviews: vi.fn(), usePrRuns: vi.fn() }));
import { useBrief, useGenerateBrief } from "@/lib/hooks";
import { usePrReviews, usePrRuns } from "@/lib/hooks/reviews";

// The brief's file links deep-link INTO the diff tab via client-side router.push;
// stub next/navigation so we can assert the target URL and supply route params.
const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push }),
  useParams: () => ({ repoId: "r1", number: "7" }),
}));

afterEach(cleanup);
afterEach(() => nav.push.mockClear());

const BRIEF: Brief = {
  what: "Adds rate limiting to the public API.",
  why: "Protects the service from abuse after a recent incident.",
  risk_level: "high",
  risks: [
    {
      kind: "security",
      title: "Bypassable limiter",
      explanation: "The limiter keys on IP only, which can be spoofed behind a proxy.",
      severity: "high",
      file_refs: ["src/lib/rate.ts"],
    },
  ],
  review_focus: [
    { path: "src/lib/rate.ts", line: 42, reason: "Core limiter logic — verify the key derivation." },
  ],
  generated_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
};

const REVIEW: ReviewRecord = {
  id: "rev-1",
  pr_id: "pr-1",
  agent_id: "agent-1",
  run_id: "run-1",
  agent_name: "General",
  kind: "review",
  verdict: "approve",
  summary: "Looks fine.",
  score: 88,
  model: "gpt",
  grounding: null,
  created_at: new Date().toISOString(),
  findings: [
    {
      id: "f-1",
      review_id: "rev-1",
      file: "src/lib/rate.ts",
      start_line: 10,
      end_line: 10,
      severity: "WARNING",
      category: "bug",
      title: "x",
      rationale: "y",
      suggestion: null,
      confidence: 0.8,
      kind: "finding",
      accepted_at: null,
      dismissed_at: null,
    } as ReviewRecord["findings"][number],
  ],
};

const RUN: RunSummary = {
  run_id: "run-1",
  agent_id: "agent-1",
  agent_name: "General",
  provider: "openai",
  model: "gpt",
  status: "done",
  error: null,
  duration_ms: 1200,
  tokens_in: 8000,
  tokens_out: 1200,
  cost_usd: 0.0123,
  findings_count: 1,
  grounding: null,
  ran_at: new Date().toISOString(),
  score: 88,
  blockers: 0,
};

function setBriefHook(over: Record<string, unknown>) {
  vi.mocked(useBrief).mockReturnValue({
    data: undefined,
    isPending: false,
    ...over,
  } as unknown as ReturnType<typeof useBrief>);
}

function setGenerateHook(mutate = vi.fn(), over: Record<string, unknown> = {}) {
  vi.mocked(useGenerateBrief).mockReturnValue({
    mutate,
    isPending: false,
    ...over,
  } as unknown as ReturnType<typeof useGenerateBrief>);
  return mutate;
}

function setReviewHooks(reviews: ReviewRecord[] = [], runs: RunSummary[] = []) {
  vi.mocked(usePrReviews).mockReturnValue({ data: reviews } as unknown as ReturnType<typeof usePrReviews>);
  vi.mocked(usePrRuns).mockReturnValue({ data: runs } as unknown as ReturnType<typeof usePrRuns>);
}

function renderCard(props: Partial<React.ComponentProps<typeof PrBriefCard>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <PrBriefCard prId="pr-1" {...props} />
    </NextIntlClientProvider>,
  );
}

describe("PrBriefCard", () => {
  it("shows a Generate button when no brief exists yet, and does not auto-fire generation (AC-7)", () => {
    setBriefHook({ data: null, isPending: false });
    const mutate = setGenerateHook();
    setReviewHooks();
    renderCard();

    expect(screen.getByText("Brief not generated yet.")).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: /generate brief/i });
    expect(btn).toBeInTheDocument();
    // No POST fired on mount.
    expect(mutate).not.toHaveBeenCalled();

    // Click fires exactly one generation call.
    fireEvent.click(btn);
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("renders risk level with BOTH a color chip and a text label (AC-9, a11y)", () => {
    setBriefHook({ data: BRIEF, isPending: false });
    setGenerateHook();
    setReviewHooks();
    renderCard();

    // The label text must be present regardless of color (queryable by text).
    // "High risk" appears twice: the top-level risk-level chip and the risks
    // list's per-risk severity chip (this fixture's one risk is also "high").
    const chips = screen.getAllByText("High risk");
    expect(chips.length).toBeGreaterThan(0);
    // Each is rendered inside a colored chip element (style carries a non-default color).
    for (const chip of chips) {
      expect(chip.closest("span")).toHaveStyle({ color: "var(--crit)" });
    }
  });

  it("shows review-focus rows as path:line + reason, deep-linking INTO the diff tab (internal nav, not GitHub)", () => {
    setBriefHook({ data: BRIEF, isPending: false });
    setGenerateHook();
    setReviewHooks();
    renderCard();

    expect(screen.getByText("src/lib/rate.ts:42")).toBeInTheDocument();
    expect(
      screen.getByText("Core limiter logic — verify the key derivation."),
    ).toBeInTheDocument();

    // The focus link is an in-app control (no external <a href>) that pushes to
    // the Smart Changes diff tab focused on the file.
    const link = screen.getByRole("button", { name: "src/lib/rate.ts:42" });
    fireEvent.click(link);
    expect(nav.push).toHaveBeenCalledWith("/repos/r1/pulls/7?tab=diff&file=src%2Flib%2Frate.ts");
  });

  it("deep-links a Risk area's file reference into the diff tab too", () => {
    setBriefHook({ data: BRIEF, isPending: false });
    setGenerateHook();
    setReviewHooks();
    renderCard();

    // The one risk's file_ref renders as its own in-app link.
    const ref = screen.getByRole("button", { name: "src/lib/rate.ts" });
    fireEvent.click(ref);
    expect(nav.push).toHaveBeenCalledWith("/repos/r1/pulls/7?tab=diff&file=src%2Flib%2Frate.ts");
  });

  it("composes the top row (verdict/score/cost/findings) from review data, not the brief (AC-13)", () => {
    setBriefHook({ data: null, isPending: false });
    setGenerateHook();
    setReviewHooks([REVIEW], [RUN]);
    renderCard();

    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText("Score 88")).toBeInTheDocument();
    expect(screen.getByText("$0.0123")).toBeInTheDocument();
    expect(screen.getByText("1 finding")).toBeInTheDocument();
  });

  it("shows a neutral empty top row when there is no review yet", () => {
    setBriefHook({ data: null, isPending: false });
    setGenerateHook();
    setReviewHooks([], []);
    renderCard();

    expect(screen.getByText("No review yet")).toBeInTheDocument();
  });

  it("wires Regenerate to useGenerateBrief and resolves every i18n key without throwing (AC-6, AC-14)", () => {
    setBriefHook({ data: BRIEF, isPending: false });
    const mutate = setGenerateHook();
    setReviewHooks([REVIEW], [RUN]);
    renderCard();

    const regen = screen.getByRole("button", { name: /regenerate/i });
    fireEvent.click(regen);
    expect(mutate).toHaveBeenCalledTimes(1);

    // Controls carry an accessible name (their text content), satisfying the
    // "links/controls are labeled" i18n requirement.
    expect(screen.getByRole("button", { name: "src/lib/rate.ts:42" })).toHaveAccessibleName(
      "src/lib/rate.ts:42",
    );
  });

  it("shows an explicit error state when the brief query itself fails, with NO Generate button (review fix #5)", () => {
    setBriefHook({ data: undefined, isPending: false, isError: true });
    setGenerateHook();
    setReviewHooks();
    renderCard();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't load the brief. This PR may be unreachable, or something went wrong on our end.",
    );
    // A failed read gives no signal a generate would succeed — never offer it.
    expect(screen.queryByRole("button", { name: /generate brief/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Brief not generated yet.")).not.toBeInTheDocument();
  });

  it("shows an inline error near the button when generate/regenerate mutation fails (review fix #5)", () => {
    setBriefHook({ data: null, isPending: false });
    const mutate = setGenerateHook(vi.fn(), { isError: true });
    setReviewHooks();
    renderCard();

    // Empty state: Generate button stays usable for retry, error shown alongside.
    expect(screen.getByRole("button", { name: /generate brief/i })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Generating the brief failed. Please try again.");
    fireEvent.click(screen.getByRole("button", { name: /generate brief/i }));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("shows an inline error near Regenerate when a regenerate mutation fails on an existing brief (review fix #5)", () => {
    setBriefHook({ data: BRIEF, isPending: false });
    setGenerateHook(vi.fn(), { isError: true });
    setReviewHooks([REVIEW], [RUN]);
    renderCard();

    expect(screen.getByRole("button", { name: /regenerate/i })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Generating the brief failed. Please try again.");
    // The brief body itself still renders — a failed regenerate doesn't blank the existing brief.
    expect(screen.getByText("Adds rate limiting to the public API.")).toBeInTheDocument();
  });
});
