import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ContextAttachment, ProjectContextDoc } from "@devdigest/shared";
import agentsMessages from "../../../../../../../../messages/en/agents.json";
import projectContextMessages from "../../../../../../../../messages/en/projectContext.json";

// Mock the data hooks so ContextTab renders without a network/query client.
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "repo-1", reposLoaded: true }),
}));

const DOCS: ProjectContextDoc[] = [
  { path: "specs/a.md", badge: "specs", tokens: 12000, used_by: 1, coverage: 0.5 },
  { path: "docs/b.md", badge: "docs", tokens: 9000, used_by: 1, coverage: 0.5 },
  { path: "insights/c.md", badge: "insights", tokens: 500, used_by: 0, coverage: 0 },
];
const ATTACHMENTS: ContextAttachment[] = [
  { path: "specs/a.md", order: 0 },
  { path: "docs/b.md", order: 1 },
];

vi.mock("@/lib/hooks/projectContext", () => ({
  useProjectContextDocs: () => ({ data: DOCS }),
}));

const setContextMutate = vi.fn();
vi.mock("@/lib/hooks/agentContext", () => ({
  useAgentContext: () => ({ data: ATTACHMENTS }),
  useSetAgentContext: () => ({ mutate: setContextMutate }),
}));

import { ContextTab } from "./ContextTab";

afterEach(() => {
  cleanup();
  setContextMutate.mockClear();
});

function renderTab() {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ agents: agentsMessages, projectContext: projectContextMessages }}
    >
      <ContextTab agentId="ag1" />
    </NextIntlClientProvider>,
  );
}

describe("Agent Editor Context tab", () => {
  it("shows attached docs checked with per-doc + total tokens and a large-set warning, and detaches on checkbox click (AC-17, AC-20)", () => {
    renderTab();

    // Both attached docs are checked; the unattached one is not.
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(3);
    expect(checkboxes[0]).toBeChecked(); // specs/a.md
    expect(checkboxes[1]).toBeChecked(); // docs/b.md
    expect(checkboxes[2]).not.toBeChecked(); // insights/c.md

    // Per-doc token counts + total for the SELECTED set (12000 + 9000 = 21000).
    expect(screen.getByText("12000 tok")).toBeInTheDocument();
    expect(screen.getByText("9000 tok")).toBeInTheDocument();
    expect(screen.getByText("21000 tokens total")).toBeInTheDocument();
    expect(
      screen.getByText("Large context set — roughly 21000 tokens will be added to every review prompt."),
    ).toBeInTheDocument();

    // Detach specs/a.md — only docs/b.md remains attached, in order.
    fireEvent.click(checkboxes[0]!);
    expect(setContextMutate).toHaveBeenCalledWith(["docs/b.md"]);
  });

  it("narrows the visible rows via the filter box without changing attachment (AC-4)", () => {
    renderTab();

    expect(screen.getByText("docs/b.md")).toBeInTheDocument();
    expect(screen.getByText("insights/c.md")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Filter…"), { target: { value: "specs" } });

    expect(screen.getByText("specs/a.md")).toBeInTheDocument();
    expect(screen.queryByText("docs/b.md")).not.toBeInTheDocument();
    expect(screen.queryByText("insights/c.md")).not.toBeInTheDocument();
    expect(setContextMutate).not.toHaveBeenCalled();
  });

  it("drag-reorders the attached set and persists the new order (AC-5)", () => {
    renderTab();

    const rows = screen.getAllByRole("listitem");
    // Drag the first row (specs/a.md) onto the second (docs/b.md).
    fireEvent.dragStart(rows[0]!);
    fireEvent.dragOver(rows[1]!);
    fireEvent.drop(rows[1]!);

    expect(setContextMutate).toHaveBeenCalledWith(["docs/b.md", "specs/a.md"]);
  });
});
