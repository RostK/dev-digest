import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { FindingRecord } from "@devdigest/shared";
import { FindingsHoverCard } from "./FindingsHoverCard";

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
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

/** mouseEnter doesn't bubble — fire it on the wrapper that owns the handler. */
function hoverTrigger() {
  fireEvent.mouseEnter(screen.getByText("cluster").parentElement!);
}

describe("FindingsHoverCard", () => {
  it("hides the card until hovered, then lists the findings + fires onOpen once", () => {
    const onOpen = vi.fn();
    render(
      <FindingsHoverCard
        title="2 findings"
        findings={[
          finding({}),
          finding({ id: "f2", title: "N+1 query in user list", category: "perf", file: "src/users.ts", start_line: 42 }),
        ]}
        emptyLabel="No open findings"
        onOpen={onOpen}
      >
        <span>cluster</span>
      </FindingsHoverCard>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    hoverTrigger();
    expect(screen.getByRole("dialog")).toHaveTextContent("2 findings");
    expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
    expect(screen.getByText("N+1 query in user list")).toBeInTheDocument();
    expect(screen.getByText("src/config.ts:11")).toBeInTheDocument();

    hoverTrigger(); // re-hover without leaving must not re-fire the lazy fetch
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("caps the list at 5 (most recent first) and collapses the rest into a +N more footer", () => {
    const findings = Array.from({ length: 7 }, (_, i) =>
      finding({ id: `f${i}`, title: `Finding ${i}`, start_line: i }),
    );
    render(
      <FindingsHoverCard
        title="7 findings"
        findings={findings}
        emptyLabel="No open findings"
        moreLabel={(n) => `+${n} more`}
      >
        <span>cluster</span>
      </FindingsHoverCard>,
    );
    hoverTrigger();
    // First 5 (the array is passed most-recent-first) are listed; #5 and #6 are not.
    expect(screen.getByText("Finding 0")).toBeInTheDocument();
    expect(screen.getByText("Finding 4")).toBeInTheDocument();
    expect(screen.queryByText("Finding 5")).not.toBeInTheDocument();
    expect(screen.queryByText("Finding 6")).not.toBeInTheDocument();
    expect(screen.getByText("+2 more")).toBeInTheDocument();
  });

  it("shows no +N more footer when the list fits within the cap", () => {
    render(
      <FindingsHoverCard
        title="2 findings"
        findings={[finding({}), finding({ id: "f2", title: "Second" })]}
        emptyLabel="No open findings"
        moreLabel={(n) => `+${n} more`}
      >
        <span>cluster</span>
      </FindingsHoverCard>,
    );
    hoverTrigger();
    expect(screen.queryByText(/more/)).not.toBeInTheDocument();
  });

  it("shows the empty label when there are no findings", () => {
    render(
      <FindingsHoverCard title="0 findings" findings={[]} emptyLabel="No open findings">
        <span>cluster</span>
      </FindingsHoverCard>,
    );
    hoverTrigger();
    expect(screen.getByText("No open findings")).toBeInTheDocument();
  });

  it("does not show the empty label while findings are still loading", () => {
    render(
      <FindingsHoverCard title="3 findings" findings={undefined} loading emptyLabel="No open findings">
        <span>cluster</span>
      </FindingsHoverCard>,
    );
    hoverTrigger();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText("No open findings")).not.toBeInTheDocument();
  });
});
