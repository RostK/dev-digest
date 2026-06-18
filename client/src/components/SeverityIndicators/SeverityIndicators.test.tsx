import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SeverityIndicators } from "./SeverityIndicators";

afterEach(cleanup);

describe("SeverityIndicators", () => {
  it("renders one chip per non-zero severity with an accessible count label", () => {
    render(<SeverityIndicators counts={{ critical: 2, warning: 1, suggestion: 3 }} />);
    expect(screen.getByTitle("2 Critical")).toBeInTheDocument();
    expect(screen.getByTitle("1 Warning")).toBeInTheDocument();
    expect(screen.getByTitle("3 Suggestion")).toBeInTheDocument();
  });

  it("hides zero-count severities", () => {
    render(<SeverityIndicators counts={{ critical: 0, warning: 4, suggestion: 0 }} />);
    expect(screen.getByTitle("4 Warning")).toBeInTheDocument();
    expect(screen.queryByTitle(/Critical/)).not.toBeInTheDocument();
    expect(screen.queryByTitle(/Suggestion/)).not.toBeInTheDocument();
  });

  it("renders a muted dash when all counts are zero", () => {
    render(<SeverityIndicators counts={{ critical: 0, warning: 0, suggestion: 0 }} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByTitle(/Critical|Warning|Suggestion/)).not.toBeInTheDocument();
  });

  it("renders a muted dash when counts is null/undefined", () => {
    const { rerender } = render(<SeverityIndicators counts={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    rerender(<SeverityIndicators counts={undefined} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("makes chips clickable buttons that call onSelect with the severity", () => {
    const onSelect = vi.fn();
    render(
      <SeverityIndicators counts={{ critical: 2, warning: 1, suggestion: 0 }} onSelect={onSelect} />,
    );
    const crit = screen.getByTitle("2 Critical");
    expect(crit).toHaveAttribute("role", "button");
    fireEvent.click(crit);
    expect(onSelect).toHaveBeenCalledWith("CRITICAL");
  });

  it("marks the active chip pressed (and leaves it un-pressed otherwise)", () => {
    render(
      <SeverityIndicators
        counts={{ critical: 2, warning: 1, suggestion: 0 }}
        active="CRITICAL"
        onSelect={() => {}}
      />,
    );
    expect(screen.getByTitle("2 Critical")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTitle("1 Warning")).toHaveAttribute("aria-pressed", "false");
  });

  it("is not interactive without onSelect (no button role)", () => {
    render(<SeverityIndicators counts={{ critical: 1, warning: 0, suggestion: 0 }} />);
    expect(screen.getByTitle("1 Critical")).not.toHaveAttribute("role");
  });
});
