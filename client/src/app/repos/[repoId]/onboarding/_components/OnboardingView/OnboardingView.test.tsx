import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, within, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { NAV, resolveHref } from "@devdigest/ui";
import type { Onboarding, OnboardingResponse } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/onboarding.json";
import { activeKeyFor } from "@/components/app-shell/helpers";
import { githubBlobUrl } from "@/lib/github-urls";

// ---- module mocks (mirrors BlastTab.test.tsx / ProjectContextView.test.tsx:
// mock at the hook/component boundary, not fetch) ----
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children, crumb }: { children: React.ReactNode; crumb?: { label: string }[] }) => (
    <div>
      <div data-testid="crumb">{crumb?.map((c) => c.label).join(" / ")}</div>
      {children}
    </div>
  ),
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    repoId: "repo-1",
    activeRepo: { id: "repo-1", full_name: "acme/widgets", default_branch: "main" },
    repos: [],
    reposLoaded: true,
    setRepoId: vi.fn(),
  }),
  useRepoNotFound: () => false,
}));

vi.mock("@/components/mermaid-diagram", () => ({
  MermaidDiagram: ({ chart }: { chart: string }) => <div role="img" aria-label={`mermaid:${chart}`} />,
}));

vi.mock("@/lib/hooks/onboarding", () => ({
  useOnboarding: vi.fn(),
  useGenerateOnboarding: vi.fn(),
  useOnboardingJob: vi.fn(),
}));
import { useOnboarding, useGenerateOnboarding, useOnboardingJob } from "@/lib/hooks/onboarding";

import { OnboardingView } from "./OnboardingView";

afterEach(cleanup);

function setOnboarding(over: Partial<{ data: OnboardingResponse; isLoading: boolean; isError: boolean; refetch: () => void }>) {
  vi.mocked(useOnboarding).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...over,
  } as unknown as ReturnType<typeof useOnboarding>);
}

function setGenerate(over: Record<string, unknown> = {}) {
  vi.mocked(useGenerateOnboarding).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    data: undefined,
    ...over,
  } as unknown as ReturnType<typeof useGenerateOnboarding>);
  return vi.mocked(useGenerateOnboarding).mock.results[0]?.value;
}

beforeEach(() => {
  // The dedicated job-status poll is never given data in these tests — every
  // scenario drives its "in-flight job" state through the envelope's own
  // `data.job` field instead (OnboardingView falls back to it).
  vi.mocked(useOnboardingJob).mockReturnValue({
    data: undefined,
    isLoading: false,
  } as unknown as ReturnType<typeof useOnboardingJob>);
  Object.defineProperty(window.navigator, "clipboard", {
    value: { writeText: vi.fn() },
    configurable: true,
  });
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <OnboardingView repoId="repo-1" />
    </NextIntlClientProvider>,
  );
}

const FULL_TOUR: Onboarding = {
  // Deliberately scrambled — proves the client re-derives the canonical order
  // (AC-3) instead of trusting response array order.
  sections: [
    {
      kind: "first_tasks",
      title: "First tasks",
      body: "- Read the onboarding docs\n- Run the test suite",
      diagram: null,
      links: [],
    },
    {
      kind: "how_to_run",
      title: "How to run locally",
      body: "1. `pnpm install`\n2. `pnpm dev`",
      diagram: null,
      links: [],
    },
    {
      kind: "reading_path",
      title: "Guided reading path",
      body: "",
      diagram: null,
      links: [
        { label: "Entry point", path: "src/index.ts", rationale: "Where the server boots.", used_by: null },
      ],
    },
    {
      kind: "critical_paths",
      title: "Critical paths",
      body: "",
      diagram: null,
      links: [
        { label: "Rate limiter", path: "src/lib/rate.ts", rationale: "Guards every public route.", used_by: 4 },
      ],
    },
    {
      kind: "architecture",
      title: "Architecture overview",
      body: "The **API** talks to Postgres.",
      diagram: "flowchart LR\n  A --> B",
      links: [],
    },
  ],
};

function envelope(over: Partial<OnboardingResponse> = {}): OnboardingResponse {
  return {
    tour: FULL_TOUR,
    generated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    files_indexed: 128,
    indexed: true,
    stale: false,
    job: null,
    ...over,
  };
}

describe("nav + activeKeyFor (AC-1)", () => {
  it("registers a WORKSPACE onboarding-tour nav item whose :repoId href resolves against the active repo", () => {
    const workspace = NAV.find((g) => g.section === "WORKSPACE")!;
    const item = workspace.items.find((i) => i.key === "onboarding-tour");
    expect(item).toBeDefined();
    expect(item!.href).toBe("/repos/:repoId/onboarding");
    expect(resolveHref(item!.href, "repo-1")).toBe("/repos/repo-1/onboarding");
  });

  it("highlights onboarding-tour on the repo-scoped tour route but NOT on the bare /onboarding add-repo route", () => {
    expect(activeKeyFor("/repos/repo-1/onboarding")).toBe("onboarding-tour");
    expect(activeKeyFor("/onboarding")).not.toBe("onboarding-tour");
  });
});

describe("OnboardingView", () => {
  it("shows the not-indexed state and no way to trigger generation when the repo hasn't been indexed (AC-19)", () => {
    setOnboarding({ data: envelope({ tour: null, indexed: false, generated_at: null, files_indexed: 0 }) });
    setGenerate();
    renderView();

    expect(screen.getByText("Index this repo first")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate onboarding tour" })).not.toBeInTheDocument();
  });

  it("shows the empty Generate state with no auto-generate, then enqueues on click (AC-5)", () => {
    const mutate = vi.fn();
    setOnboarding({ data: envelope({ tour: null, generated_at: null, files_indexed: 0, job: null }) });
    setGenerate({ mutate });
    renderView();

    expect(screen.getByRole("button", { name: "Generate onboarding tour" })).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Generate onboarding tour" }));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("shows a generating state (not the empty CTA) while the first-generation job is queued/running (AC-23)", () => {
    setOnboarding({
      data: envelope({
        tour: null,
        generated_at: null,
        files_indexed: 0,
        job: { job_id: "job-1", status: "running", error: null },
      }),
    });
    setGenerate();
    renderView();

    expect(screen.getByText("Generating the onboarding tour…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate onboarding tour" })).not.toBeInTheDocument();
  });

  it("renders the breadcrumb, header, and the five section cards in canonical order with a matching ON THIS PAGE nav (AC-2, AC-3, AC-4, AC-10, AC-12, AC-13, AC-14, AC-15, AC-20)", () => {
    setOnboarding({ data: envelope() });
    setGenerate();
    renderView();

    // AC-2 — breadcrumb + header
    expect(screen.getByTestId("crumb")).toHaveTextContent("acme/widgets");
    expect(screen.getByTestId("crumb")).toHaveTextContent("Onboarding Tour");
    expect(screen.getByRole("heading", { name: "Onboarding for acme/widgets" })).toBeInTheDocument();

    // AC-4 — subtitle: file count + relative time
    expect(screen.getByText(/128/)).toBeInTheDocument();
    expect(screen.getByText(/2 hours ago/)).toBeInTheDocument();

    // AC-3 — canonical order, independent of the scrambled response order.
    // Target the section cards by their stable anchor ids (what the ON THIS PAGE
    // nav's #href points at) — the section title text also appears in the TOC,
    // so a text query would be ambiguous.
    const cards = ["architecture", "critical_paths", "how_to_run", "reading_path", "first_tasks"].map((id) =>
      document.getElementById(id),
    );
    for (const card of cards) expect(card).toBeInTheDocument();
    for (let i = 0; i < cards.length - 1; i++) {
      expect(cards[i]!.compareDocumentPosition(cards[i + 1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }

    // AC-3 / AC-20 — "on this page" anchors, one per card, keyboard/labeled
    expect(screen.getByRole("link", { name: "Architecture overview" })).toHaveAttribute("href", "#architecture");
    expect(screen.getByRole("link", { name: "Critical paths" })).toHaveAttribute("href", "#critical_paths");
    expect(screen.getByRole("link", { name: "How to run locally" })).toHaveAttribute("href", "#how_to_run");
    expect(screen.getByRole("link", { name: "Guided reading path" })).toHaveAttribute("href", "#reading_path");
    expect(screen.getByRole("link", { name: "First tasks" })).toHaveAttribute("href", "#first_tasks");

    // AC-10 — architecture body (markdown) + diagram (mermaid, reused component)
    expect(screen.getByText("API")).toBeInTheDocument();
    // accessible-name computation collapses the aria-label's "\n  " to a single
    // space, so match whitespace-tolerantly rather than with the raw chart string.
    expect(screen.getByRole("img", { name: /mermaid:flowchart LR\s+A --> B/ })).toBeInTheDocument();

    // AC-12 — critical paths: rationale + deterministic "used by N routes" + Open
    const criticalRow = screen.getByText("Rate limiter").closest('[role="listitem"]') as HTMLElement;
    expect(within(criticalRow).getByText("src/lib/rate.ts")).toBeInTheDocument();
    expect(within(criticalRow).getByText("Guards every public route.")).toBeInTheDocument();
    expect(within(criticalRow).getByText("used by 4 routes")).toBeInTheDocument();
    expect(within(criticalRow).getByRole("link", { name: "Open" })).toHaveAttribute(
      "href",
      githubBlobUrl("acme/widgets", "main", "src/lib/rate.ts"),
    );

    // AC-14 — guided reading path: numbered files + "why"
    const readingRow = screen.getByText("Entry point").closest('[role="listitem"]') as HTMLElement;
    expect(within(readingRow).getByText("1.")).toBeInTheDocument();
    expect(within(readingRow).getByText("src/index.ts")).toBeInTheDocument();
    expect(within(readingRow).getByText("Where the server boots.")).toBeInTheDocument();
    expect(within(readingRow).getByRole("link", { name: "Open" })).toHaveAttribute(
      "href",
      githubBlobUrl("acme/widgets", "main", "src/index.ts"),
    );

    // AC-13 — how to run: numbered, copyable shell steps
    expect(screen.getByText("pnpm install")).toBeInTheDocument();
    expect(screen.getByText("pnpm dev")).toBeInTheDocument();
    const copyStep1 = screen.getByRole("button", { name: "Copy step 1" });
    fireEvent.click(copyStep1);
    expect(window.navigator.clipboard.writeText).toHaveBeenCalledWith("pnpm install");

    // AC-15 — first tasks list
    expect(screen.getByText("Read the onboarding docs")).toBeInTheDocument();
    expect(screen.getByText("Run the test suite")).toBeInTheDocument();
  });

  it("omits the mermaid diagram (but still renders the body) when a section has no diagram (AC-11)", () => {
    setOnboarding({
      data: envelope({
        tour: {
          sections: [
            { kind: "architecture", title: "Architecture overview", body: "Just text.", diagram: null, links: [] },
          ],
        },
      }),
    });
    setGenerate();
    renderView();

    expect(screen.getByText("Just text.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("Regenerate requires confirmation — cancel sends no request, confirm enqueues one (AC-9)", () => {
    const mutate = vi.fn();
    setOnboarding({ data: envelope() });
    setGenerate({ mutate });
    renderView();

    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    // Two "Regenerate" buttons now exist (header action + modal confirm) —
    // the modal's is the last one rendered.
    const confirmButtons = screen.getAllByRole("button", { name: "Regenerate" });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]!);
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("copies the current page URL when Share link is clicked (AC-21)", () => {
    setOnboarding({ data: envelope() });
    setGenerate();
    renderView();

    fireEvent.click(screen.getByRole("button", { name: "Share link" }));
    expect(window.navigator.clipboard.writeText).toHaveBeenCalledWith(window.location.href);
  });

  it("shows Updating… while a job is in flight and Stale when the index has advanced with no job running (AC-22)", () => {
    setOnboarding({ data: envelope({ job: { job_id: "job-2", status: "running", error: null }, stale: true }) });
    setGenerate();
    const { unmount } = renderView();
    // jobActive suppresses the stale badge even though stale=true.
    expect(screen.getByText("Updating…")).toBeInTheDocument();
    expect(screen.queryByText("Stale")).not.toBeInTheDocument();
    unmount();

    setOnboarding({ data: envelope({ job: null, stale: true }) });
    renderView();
    expect(screen.getByText("Stale")).toBeInTheDocument();
    expect(screen.queryByText("Updating…")).not.toBeInTheDocument();
  });
});
