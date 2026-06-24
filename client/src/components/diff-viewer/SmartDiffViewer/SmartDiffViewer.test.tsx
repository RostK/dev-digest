/**
 * SmartDiffViewer — props-driven, no fetch mocking needed.
 *
 * Assertions:
 * 1. Groups render in core → wiring → boilerplate order.
 * 2. Boilerplate section is collapsed by default (its files not visible).
 * 3. A file with finding_lines shows a badge with the correct count.
 * 4. A core file renders before a boilerplate file (DOM order).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SmartDiff } from "@devdigest/shared";
import type { PrFile } from "@devdigest/shared";
import prReviewMessages from "../../../../messages/en/prReview.json";
import shellMessages from "../../../../messages/en/shell.json";
import { SmartDiffViewer } from "./SmartDiffViewer";

const messages = { prReview: prReviewMessages, shell: shellMessages };

afterEach(cleanup);

// ---- fixtures ----

const CORE_FILE: PrFile = {
  path: "src/core.ts",
  additions: 10,
  deletions: 2,
  patch: "@@ -1,2 +1,10 @@\n context\n+add1\n+add2",
};

const WIRING_FILE: PrFile = {
  path: "src/router.ts",
  additions: 3,
  deletions: 1,
  patch: "@@ -1,1 +1,3 @@\n context\n+route1",
};

const BOILERPLATE_FILE: PrFile = {
  path: "package-lock.json",
  additions: 500,
  deletions: 200,
  patch: "@@ -1,1 +1,500 @@\n{",
};

const SMART_DIFF: SmartDiff = {
  groups: [
    {
      role: "core",
      files: [
        {
          path: "src/core.ts",
          pseudocode_summary: null,
          additions: 10,
          deletions: 2,
          finding_lines: [2, 3],
        },
      ],
    },
    {
      role: "wiring",
      files: [
        {
          path: "src/router.ts",
          pseudocode_summary: null,
          additions: 3,
          deletions: 1,
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
  split_suggestion: {
    too_big: false,
    total_lines: 716,
    proposed_splits: [],
  },
};

const ALL_PR_FILES: PrFile[] = [CORE_FILE, WIRING_FILE, BOILERPLATE_FILE];

function renderViewer(smartDiff: SmartDiff = SMART_DIFF, files: PrFile[] = ALL_PR_FILES) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SmartDiffViewer files={files} smartDiff={smartDiff} />
    </NextIntlClientProvider>,
  );
}

// ---- tests ----

describe("SmartDiffViewer", () => {
  it("renders groups in core → wiring → boilerplate order", () => {
    renderViewer();

    const core = screen.getByText("Core");
    const wiring = screen.getByText("Wiring");
    const boilerplate = screen.getByText("Boilerplate");

    expect(core).toBeInTheDocument();
    expect(wiring).toBeInTheDocument();
    expect(boilerplate).toBeInTheDocument();

    // DOM order: core must appear before wiring, wiring before boilerplate
    const all = screen.getAllByText(/^(Core|Wiring|Boilerplate)$/);
    expect(all[0]).toHaveTextContent("Core");
    expect(all[1]).toHaveTextContent("Wiring");
    expect(all[2]).toHaveTextContent("Boilerplate");
  });

  it("boilerplate section is collapsed by default — package-lock.json is not visible", () => {
    renderViewer();
    // The boilerplate group header is visible but the file path inside it should not be rendered
    expect(screen.getByText("Boilerplate")).toBeInTheDocument();
    expect(screen.queryByText("package-lock.json")).not.toBeInTheDocument();
  });

  it("expanding boilerplate section reveals its files", () => {
    renderViewer();
    // Click the boilerplate group header to expand
    const header = screen.getByRole("button", { name: "Boilerplate" });
    fireEvent.click(header);
    // Now the file should be visible
    expect(screen.getByText("package-lock.json")).toBeInTheDocument();
  });

  it("a file with finding_lines shows a findings badge with the correct count", () => {
    renderViewer();
    // core file has finding_lines: [2, 3] → 2 findings badge
    expect(screen.getByText("2 findings")).toBeInTheDocument();
  });

  it("wiring file with no findings does not show a findings badge", () => {
    renderViewer();
    // Only one badge from core file; wiring has no finding lines
    const badges = screen.queryAllByText(/\d+ findings/);
    // Only the core file badge (1 total)
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveTextContent("2 findings");
  });

  it("a core file (src/core.ts) appears in the DOM before the boilerplate file path (package-lock.json)", () => {
    renderViewer();
    // Expand boilerplate so both files are in DOM
    fireEvent.click(screen.getByRole("button", { name: "Boilerplate" }));
    const corePath = screen.getByText("src/core.ts");
    const boilerplatePath = screen.getByText("package-lock.json");
    // compareDocumentPosition: corePath should come before boilerplatePath
    const pos = corePath.compareDocumentPosition(boilerplatePath);
    // Node.DOCUMENT_POSITION_FOLLOWING = 4 (boilerplate is after core)
    expect(pos & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders a split suggestion banner when too_big is true", () => {
    const bigDiff: SmartDiff = {
      ...SMART_DIFF,
      split_suggestion: {
        too_big: true,
        total_lines: 1500,
        proposed_splits: [{ name: "auth-split", files: ["src/auth.ts"] }],
      },
    };
    renderViewer(bigDiff);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/1500/)).toBeInTheDocument();
    expect(screen.getByText("auth-split")).toBeInTheDocument();
  });

  it("does not render split suggestion banner when too_big is false", () => {
    renderViewer();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
