import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Conflict } from "@devdigest/shared";
import messages from "../../../../../messages/en/multiAgentFindings.json";
import { ConflictsBlock } from "./ConflictsBlock";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ multiAgentFindings: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

// Two agents flagged the same spot with the SAME severity — a duplicate, not a
// disagreement (hidden by "Show only conflicts").
const AGREEING: Conflict = {
  file: "src/api.ts",
  line: 42,
  title: "Missing input validation",
  takes: [
    { agent_id: "a1", persona: "Security", verdict: "WARNING", note: "Flags a validation gap." },
    {
      agent_id: "a2",
      persona: "Architecture",
      verdict: "WARNING",
      note: "Also flags the same gap.",
    },
  ],
};

// One agent flagged it CRITICAL; another reviewed the file but did not flag
// this location — a real divergence.
const DIVERGENT: Conflict = {
  file: "src/db.ts",
  line: 10,
  title: "N+1 query pattern",
  takes: [
    {
      agent_id: "a1",
      persona: "Performance",
      verdict: "CRITICAL",
      note: "Confirmed a hot-path N+1 query.",
    },
    {
      agent_id: "a3",
      persona: "Customer-Facing",
      verdict: "ignored",
      note: "Reviewed this file but did not flag this location.",
    },
  ],
};

describe("ConflictsBlock", () => {
  it("shows one agent's flag and another's 'did not flag' at a shared file:line (AC-15)", () => {
    renderWithIntl(<ConflictsBlock conflicts={[DIVERGENT]} />);

    expect(screen.getByText("Where agents disagree")).toBeInTheDocument();
    expect(screen.getByText("src/db.ts:10")).toBeInTheDocument();
    expect(screen.getByText("N+1 query pattern")).toBeInTheDocument();
    expect(screen.getByText("Performance")).toBeInTheDocument();
    expect(screen.getByText("Customer-Facing")).toBeInTheDocument();
    expect(screen.getByText("Did not flag")).toBeInTheDocument();
    // Severity conveyed by label, not color alone.
    expect(screen.getByTitle("Critical")).toBeInTheDocument();
  });

  it("'Show only conflicts' hides fully-agreeing groups but keeps divergent ones", () => {
    renderWithIntl(<ConflictsBlock conflicts={[AGREEING, DIVERGENT]} />);

    expect(screen.getByText("src/api.ts:42")).toBeInTheDocument();
    expect(screen.getByText("src/db.ts:10")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch"));

    expect(screen.queryByText("src/api.ts:42")).not.toBeInTheDocument();
    expect(screen.getByText("src/db.ts:10")).toBeInTheDocument();
  });
});
