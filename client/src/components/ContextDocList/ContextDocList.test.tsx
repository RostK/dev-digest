import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/projectContext.json";
import { ContextDocList, type ContextDocListItem } from "./ContextDocList";

afterEach(cleanup);

const ITEMS: ContextDocListItem[] = [
  { path: "specs/cross/SPEC-01.md", badge: "specs", tokens: 1200 },
  { path: "docs/architecture.md", badge: "docs", tokens: 900 },
];

function renderList(props: Partial<React.ComponentProps<typeof ContextDocList>> = {}) {
  const onToggle = vi.fn();
  const onReorder = vi.fn();
  const onFilterChange = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ projectContext: messages }}>
      <ContextDocList
        items={ITEMS}
        selected={new Set()}
        onToggle={onToggle}
        onReorder={onReorder}
        filter=""
        onFilterChange={onFilterChange}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { onToggle, onReorder, onFilterChange };
}

describe("ContextDocList", () => {
  it("renders each doc's path, badge and per-doc token count, and toggles attach on checkbox click", () => {
    const { onToggle } = renderList();

    expect(screen.getByText("specs/cross/SPEC-01.md")).toBeInTheDocument();
    expect(screen.getByText("docs/architecture.md")).toBeInTheDocument();
    expect(screen.getByText("specs")).toBeInTheDocument();
    expect(screen.getByText("docs")).toBeInTheDocument();
    expect(screen.getByText("1200 tok")).toBeInTheDocument();

    const [firstCheckbox] = screen.getAllByRole("checkbox");
    fireEvent.click(firstCheckbox!);
    expect(onToggle).toHaveBeenCalledWith("specs/cross/SPEC-01.md");
  });

  it("calls onFilterChange as the user types (display-only, no selection change)", () => {
    const { onFilterChange } = renderList({ selected: new Set(["docs/architecture.md"]) });

    fireEvent.change(screen.getByPlaceholderText("Filter…"), { target: { value: "arch" } });
    expect(onFilterChange).toHaveBeenCalledWith("arch");
  });

  it("narrows the visible rows to those matching the controlled filter value (AC-4 display-only)", () => {
    renderList({ filter: "arch", selected: new Set(["docs/architecture.md"]) });

    expect(screen.getByText("docs/architecture.md")).toBeInTheDocument();
    expect(screen.queryByText("specs/cross/SPEC-01.md")).not.toBeInTheDocument();
  });

  it("shows a total-tokens line for the selected set and a warning past the threshold", () => {
    renderList({
      selected: new Set(["specs/cross/SPEC-01.md", "docs/architecture.md"]),
      tokenWarningThreshold: 1000,
    });

    expect(screen.getByText("2100 tokens total")).toBeInTheDocument();
    expect(
      screen.getByText("Large context set — roughly 2100 tokens will be added to every review prompt."),
    ).toBeInTheDocument();
  });
});
