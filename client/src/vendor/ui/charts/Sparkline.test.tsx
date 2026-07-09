import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, cleanup } from "@testing-library/react";
import { Sparkline } from "./Sparkline";

afterEach(cleanup);

describe("Sparkline", () => {
  it("renders a valid (non-NaN) dot for a single data point", () => {
    // A single point has no x-span; the naive `i / (length - 1)` is 0/0 = NaN.
    const { container } = render(<Sparkline data={[0.5]} w={56} h={20} />);
    const circle = container.querySelector("circle");
    expect(circle).not.toBeNull();
    const cx = Number(circle!.getAttribute("cx"));
    const cy = Number(circle!.getAttribute("cy"));
    expect(Number.isFinite(cx)).toBe(true);
    expect(Number.isFinite(cy)).toBe(true);
    // Lone point is centered horizontally.
    expect(cx).toBe(28);
  });

  it("renders null for empty data", () => {
    const { container } = render(<Sparkline data={[]} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("spreads multiple points across the full width", () => {
    const { container } = render(<Sparkline data={[0, 1, 0.5]} w={80} h={24} />);
    const circle = container.querySelector("circle");
    // Last of 3 points sits at the right edge.
    expect(Number(circle!.getAttribute("cx"))).toBe(80);
  });
});
