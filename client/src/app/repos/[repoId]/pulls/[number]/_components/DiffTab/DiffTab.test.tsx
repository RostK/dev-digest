/**
 * DiffTab — ?file=&line= scroll-on-load (SPEC-04 Review Focus deep-link).
 *
 * PrBriefCard's review-focus rows link to `?tab=diff&file=<path>&line=<n>`;
 * DiffTab must scroll to that target once the diff renders. jsdom's
 * `scrollIntoView` is a no-op, so we spy on `Element.prototype.scrollIntoView`
 * and assert it's invoked on the expected anchor element (line anchor when it
 * exists in the DOM, else the file-level anchor).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile } from "@devdigest/shared";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import shellMessages from "../../../../../../../../messages/en/shell.json";
import { DiffTab } from "./DiffTab";

// Control the hooks directly so the test is hermetic (no fetch/QueryClient).
vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: vi.fn(() => ({ data: [] })),
  useCreatePrComment: vi.fn(() => ({ isPending: false, mutateAsync: vi.fn() })),
  usePrSmartDiff: vi.fn(() => ({ data: undefined })), // undefined → falls back to original DiffViewer
  usePrReviews: vi.fn(() => ({ data: [] })),
}));

let searchStr = "";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(searchStr),
}));

// jsdom doesn't implement scrollIntoView at all — stub it so it exists to spy on.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

afterEach(() => {
  cleanup();
  searchStr = "";
});

const messages = { prReview: prReviewMessages, shell: shellMessages };

const FILE: PrFile = {
  path: "src/lib/rate.ts",
  additions: 4,
  deletions: 1,
  patch: "@@ -1,1 +1,4 @@\n context\n+add1\n+add2\n+add3",
};

function renderTab(files: PrFile[] = [FILE]) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DiffTab prId="pr-1" filesCount={files.length} files={files} />
    </NextIntlClientProvider>,
  );
}

describe("DiffTab — scroll-to-focus", () => {
  it("scrolls to the file-level anchor when ?file=&line= is present and no highlighted line anchor exists", async () => {
    searchStr = `file=${encodeURIComponent(FILE.path)}&line=2`;
    const spy = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});

    renderTab();

    await waitFor(() => expect(spy).toHaveBeenCalled());
    const scrolledEl = spy.mock.contexts[0] as Element;
    expect(scrolledEl.id).toBe(`diff-file-${FILE.path}`);

    spy.mockRestore();
  });

  it("does not scroll when file/line params are absent", async () => {
    searchStr = "";
    const spy = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});

    renderTab();

    // Give any pending rAF a chance to run, then assert no scroll happened.
    await new Promise((r) => setTimeout(r, 50));
    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });
});
