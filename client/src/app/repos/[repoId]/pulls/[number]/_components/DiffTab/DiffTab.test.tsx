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
import type { PrFile, SmartDiff } from "@devdigest/shared";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import shellMessages from "../../../../../../../../messages/en/shell.json";
import { DiffTab } from "./DiffTab";

// Mutable per-test smart-diff fixture — undefined falls back to the original DiffViewer.
let smartDiffData: SmartDiff | undefined = undefined;

// Control the hooks directly so the test is hermetic (no fetch/QueryClient).
vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: vi.fn(() => ({ data: [] })),
  useCreatePrComment: vi.fn(() => ({ isPending: false, mutateAsync: vi.fn() })),
  usePrSmartDiff: vi.fn(() => ({ data: smartDiffData })),
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
  smartDiffData = undefined;
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

  it("resolves the deep-link to a focus file inside a collapsed boilerplate smart-diff group, after the smart-diff data (re)orders the DOM", async () => {
    // The focus file (BOILERPLATE_FILE) lives in the boilerplate group, which
    // starts collapsed — its `sd-…`/`diff-file-…` anchors don't exist until
    // SmartDiffViewer force-opens that group + its card because it contains
    // the focus path. `files` is passed in ORIGINAL pr.files order (core first)
    // while the smart-diff groups reorder it — reproducing the reorder-after-load bug.
    const CORE_FILE: PrFile = {
      path: "src/core.ts",
      additions: 10,
      deletions: 2,
      patch: "@@ -1,2 +1,10 @@\n context\n+add1\n+add2",
    };
    const BOILERPLATE_FILE: PrFile = {
      path: "package-lock.json",
      additions: 500,
      deletions: 200,
      patch: "@@ -1,1 +1,500 @@\n{\n+line1\n+line2",
    };

    smartDiffData = {
      groups: [
        {
          role: "core",
          files: [
            {
              path: "src/core.ts",
              pseudocode_summary: null,
              additions: 10,
              deletions: 2,
              finding_lines: [],
            },
          ],
        },
        {
          role: "boilerplate",
          files: [
            {
              path: "package-lock.json",
              pseudocode_summary: null,
              additions: 500,
              deletions: 200,
              finding_lines: [],
            },
          ],
        },
      ],
      split_suggestion: { too_big: false, total_lines: 512, proposed_splits: [] },
    };

    searchStr = `file=${encodeURIComponent(BOILERPLATE_FILE.path)}&line=2`;
    const spy = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});

    renderTab([CORE_FILE, BOILERPLATE_FILE]);

    // The boilerplate group + its file card must be force-opened despite starting collapsed.
    await waitFor(() => {
      expect(document.getElementById(`diff-file-${BOILERPLATE_FILE.path}`)).not.toBeNull();
    });

    // And the retry-scroll must land on the anchor once it exists.
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const scrolledEl = spy.mock.contexts[0] as Element;
    // Line 2 of the boilerplate patch ("+line1") is not a highlighted finding line
    // (finding_lines: []), so it falls back to the file-level anchor.
    expect(scrolledEl.id).toBe(`diff-file-${BOILERPLATE_FILE.path}`);

    spy.mockRestore();
  });

  it("a non-focus boilerplate file stays collapsed (no force-open regression)", async () => {
    const CORE_FILE: PrFile = {
      path: "src/core.ts",
      additions: 10,
      deletions: 2,
      patch: "@@ -1,2 +1,10 @@\n context\n+add1\n+add2",
    };
    const BOILERPLATE_FILE: PrFile = {
      path: "package-lock.json",
      additions: 500,
      deletions: 200,
      patch: "@@ -1,1 +1,500 @@\n{",
    };

    smartDiffData = {
      groups: [
        {
          role: "core",
          files: [
            {
              path: "src/core.ts",
              pseudocode_summary: null,
              additions: 10,
              deletions: 2,
              finding_lines: [],
            },
          ],
        },
        {
          role: "boilerplate",
          files: [
            {
              path: "package-lock.json",
              pseudocode_summary: null,
              additions: 500,
              deletions: 200,
              finding_lines: [],
            },
          ],
        },
      ],
      split_suggestion: { too_big: false, total_lines: 512, proposed_splits: [] },
    };

    // Focus is on the CORE file, not the boilerplate one — boilerplate must stay collapsed.
    searchStr = `file=${encodeURIComponent(CORE_FILE.path)}&line=2`;

    renderTab([CORE_FILE, BOILERPLATE_FILE]);

    await waitFor(() => {
      expect(document.getElementById(`diff-file-${CORE_FILE.path}`)).not.toBeNull();
    });
    expect(document.getElementById(`diff-file-${BOILERPLATE_FILE.path}`)).toBeNull();
  });
});
