import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { FindingRecord } from "@devdigest/shared";
import { FindingsCluster } from "./FindingsCluster";

afterEach(cleanup);

function finding(o: Partial<FindingRecord> & { id: string }): FindingRecord {
  return {
    severity: "CRITICAL",
    category: "security",
    title: o.id,
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
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

const FINDINGS = [
  finding({ id: "Crit A", severity: "CRITICAL" }),
  finding({ id: "Crit B", severity: "CRITICAL" }),
  finding({ id: "Warn A", severity: "WARNING" }),
];
const COUNTS = { critical: 2, warning: 1, suggestion: 0 };

function setup() {
  return render(
    <FindingsCluster
      counts={COUNTS}
      findings={FINDINGS}
      titleAll="3 findings"
      emptyLabel="No open findings"
      moreLabel={(n) => `+${n} more`}
    />,
  );
}

/** The hover trigger wraps the cluster span which wraps the chips. */
const trigger = () => screen.getByTitle("2 Critical").parentElement!.parentElement!;

describe("FindingsCluster", () => {
  it("hovering the cluster previews ALL findings", () => {
    setup();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.mouseEnter(trigger());
    expect(screen.getByRole("dialog")).toHaveTextContent("3 findings");
    expect(screen.getByText("Crit A")).toBeInTheDocument();
    expect(screen.getByText("Warn A")).toBeInTheDocument();
  });

  it("clicking a severity chip pins the card to ONLY that severity", () => {
    setup();
    fireEvent.click(screen.getByTitle("2 Critical")); // pin to critical
    const dialog = screen.getByRole("dialog");
    expect(screen.getByText("Crit A")).toBeInTheDocument();
    expect(screen.getByText("Crit B")).toBeInTheDocument();
    expect(screen.queryByText("Warn A")).not.toBeInTheDocument();
    expect(dialog).toHaveTextContent("Critical"); // header reflects the filter
    expect(screen.getByTitle("2 Critical")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTitle("1 Warning")).toHaveAttribute("aria-pressed", "false");
  });

  it("clicking another severity switches the filter", () => {
    setup();
    fireEvent.click(screen.getByTitle("2 Critical"));
    fireEvent.click(screen.getByTitle("1 Warning"));
    expect(screen.getByText("Warn A")).toBeInTheDocument();
    expect(screen.queryByText("Crit A")).not.toBeInTheDocument();
    expect(screen.getByTitle("1 Warning")).toHaveAttribute("aria-pressed", "true");
  });

  it("clicking the active chip again clears the filter (closes when not hovered)", () => {
    setup();
    fireEvent.click(screen.getByTitle("2 Critical"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("2 Critical"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("an outside click dismisses a pinned card", () => {
    setup();
    fireEvent.click(screen.getByTitle("2 Critical"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
