import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BlastResponse } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/blast.json";
import { BlastTab } from "./BlastTab";

// Control the hook directly so the test is hermetic (no fetch/QueryClient).
vi.mock("@/lib/hooks/blast", () => ({ useBlastRadius: vi.fn() }));
import { useBlastRadius } from "@/lib/hooks/blast";

afterEach(cleanup);

const FULL: BlastResponse = {
  blast: {
    summary: "Touches the public rate limiter.",
    changed_symbols: [{ name: "rateLimit", file: "src/lib/rate.ts", kind: "function" }],
    downstream: [
      {
        symbol: "rateLimit",
        callers: [
          { name: "handler", file: "src/api/public/index.ts", line: 23 },
          { name: "onWebhook", file: "src/api/public/webhooks.ts", line: 45 },
        ],
        endpoints_affected: ["GET /api/public/items"],
        crons_affected: [],
      },
    ],
  },
  degraded: false,
  index_status: "full",
};

function setHook(over: Record<string, unknown>) {
  vi.mocked(useBlastRadius).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...over,
  } as unknown as ReturnType<typeof useBlastRadius>);
}

function renderTab(props: Partial<React.ComponentProps<typeof BlastTab>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      <BlastTab prId="pr-1" repoFullName="acme/payments-api" headSha="abc123" {...props} />
    </NextIntlClientProvider>,
  );
}

describe("BlastTab", () => {
  it("renders the tree: symbol (with parens), callers, and the impacted endpoint", () => {
    setHook({ data: FULL });
    renderTab();

    expect(screen.getByText("rateLimit()")).toBeInTheDocument();
    // callers are expanded by default; identified by their full-path title
    expect(screen.getByTitle("src/api/public/index.ts:23")).toBeInTheDocument();
    expect(screen.getByTitle("src/api/public/webhooks.ts:45")).toBeInTheDocument();
    expect(screen.getByText("GET /api/public/items")).toBeInTheDocument();
  });

  it("links each caller to the GitHub blob at the line", () => {
    setHook({ data: FULL });
    renderTab();
    const link = screen.getByTitle("src/api/public/index.ts:23");
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/abc123/src/api/public/index.ts#L23",
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("shows a short summary by default and keeps it on expand", () => {
    setHook({ data: FULL });
    renderTab();
    // visible by default (clamped via CSS — text is still in the DOM)
    expect(screen.getByText("Touches the public rate limiter.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Touches the public rate limiter."));
    expect(screen.getByText("Touches the public rate limiter.")).toBeInTheDocument();
  });

  it("collapses all symbols except the top one by default", () => {
    setHook({
      data: {
        blast: {
          summary: "",
          changed_symbols: [
            { name: "many", file: "b.ts", kind: "function" },
            { name: "few", file: "a.ts", kind: "function" },
          ],
          downstream: [
            { symbol: "many", callers: [{ name: "p", file: "p.ts", line: 1 }, { name: "q", file: "q.ts", line: 2 }], endpoints_affected: [], crons_affected: [] },
            { symbol: "few", callers: [{ name: "x", file: "deep/dir/x.ts", line: 9 }], endpoints_affected: [], crons_affected: [] },
          ],
        },
        degraded: false,
        index_status: "full",
      },
    });
    renderTab();
    // top symbol (many, 2 callers) expanded → its caller visible
    expect(screen.getByTitle("p.ts:1")).toBeInTheDocument();
    // second symbol (few) collapsed → its caller hidden until clicked
    expect(screen.queryByTitle("deep/dir/x.ts:9")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("few()"));
    expect(screen.getByTitle("deep/dir/x.ts:9")).toBeInTheDocument();
  });

  it("sorts symbols by caller count descending", () => {
    setHook({
      data: {
        blast: {
          summary: "",
          changed_symbols: [
            { name: "few", file: "a.ts", kind: "function" },
            { name: "many", file: "b.ts", kind: "function" },
          ],
          downstream: [
            { symbol: "few", callers: [{ name: "x", file: "x.ts", line: 1 }], endpoints_affected: [], crons_affected: [] },
            {
              symbol: "many",
              callers: [
                { name: "p", file: "p.ts", line: 1 },
                { name: "q", file: "q.ts", line: 2 },
                { name: "r", file: "r.ts", line: 3 },
              ],
              endpoints_affected: [],
              crons_affected: [],
            },
          ],
        },
        degraded: false,
        index_status: "full",
      },
    });
    renderTab();
    const many = screen.getByText("many()");
    const few = screen.getByText("few()");
    // many (3 callers) must appear before few (1 caller) in the DOM
    expect(many.compareDocumentPosition(few) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("tucks zero-caller symbols behind a toggle", () => {
    setHook({
      data: {
        blast: {
          summary: "",
          changed_symbols: [
            { name: "rateLimit", file: "src/lib/rate.ts", kind: "function" },
            { name: "loneA", file: "src/a.ts", kind: "function" },
            { name: "loneB", file: "src/b.ts", kind: "function" },
          ],
          downstream: FULL.blast.downstream,
        },
        degraded: false,
        index_status: "full",
      },
    });
    renderTab();
    // hidden until expanded
    expect(screen.queryByText("loneA()")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("2 symbols with no callers"));
    expect(screen.getByText("loneA()")).toBeInTheDocument();
    expect(screen.getByText("loneB()")).toBeInTheDocument();
  });

  it("shows the partial-index badge when degraded", () => {
    setHook({ data: { ...FULL, degraded: true, index_status: "degraded" } });
    renderTab();
    expect(screen.getByText("Partial index")).toBeInTheDocument();
  });

  it("shows an empty state when there is nothing to map", () => {
    setHook({ data: { blast: { summary: "", changed_symbols: [], downstream: [] }, degraded: false, index_status: "full" } });
    renderTab();
    expect(screen.getByText("No blast radius")).toBeInTheDocument();
  });

  it("renders an error state on failure", () => {
    setHook({ isError: true });
    renderTab();
    expect(screen.getByText("Couldn't load the blast radius.")).toBeInTheDocument();
  });
});
