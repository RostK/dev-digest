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
