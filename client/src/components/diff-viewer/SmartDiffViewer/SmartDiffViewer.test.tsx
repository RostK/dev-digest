/**
 * SmartDiffViewer — props-driven, no fetch mocking needed.
 *
 * Assertions:
 * 1. Groups render in core → wiring → boilerplate order.
 * 2. Boilerplate section is collapsed by default (its files not visible).
 * 3. A file with finding_lines shows a badge with the correct count.
 * 4. A core file renders before a boilerplate file (DOM order).
 * 5. Per-line severity badges render correctly ("blocker"/"warning"/"suggestion").
 * 6. "What this does" line appears when pseudocode_summary is set.
 * 7. Core files default open; wiring files open only when they have findings.
 * 8. Clicking a severity badge reveals the finding title and rationale (InlineFinding).
 * 9. Original-order path (no findingsBySeverity) renders no inline cards.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SmartDiff, FindingRecord } from "@devdigest/shared";
import type { PrFile } from "@devdigest/shared";
import prReviewMessages from "../../../../messages/en/prReview.json";
import shellMessages from "../../../../messages/en/shell.json";
import { SmartDiffViewer } from "./SmartDiffViewer";
import type { FindingsBySeverity } from "./SmartDiffViewer";

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

// ---- reusable group fixtures ----

const WIRING_GROUP: SmartDiff["groups"][number] = {
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
};

const BOILERPLATE_GROUP: SmartDiff["groups"][number] = {
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
};

/** Core file has finding_lines, wiring/boilerplate do not. */
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
    WIRING_GROUP,
    BOILERPLATE_GROUP,
  ],
  split_suggestion: {
    too_big: false,
    total_lines: 716,
    proposed_splits: [],
  },
};

const ALL_PR_FILES: PrFile[] = [CORE_FILE, WIRING_FILE, BOILERPLATE_FILE];

/** Minimal FindingRecord fixture for the inline card tests. */
function makeFinding(overrides: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    review_id: "r1",
    severity: "WARNING",
    category: "bug",
    title: "Null pointer risk",
    file: "src/core.ts",
    start_line: 2,
    end_line: 2,
    rationale: "This line may throw when value is null.",
    suggestion: "Add a null check before dereferencing.",
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    accepted_at: null,
    dismissed_at: null,
    ...overrides,
  };
}

function renderViewer(
  smartDiff: SmartDiff = SMART_DIFF,
  files: PrFile[] = ALL_PR_FILES,
  findingsBySeverity?: FindingsBySeverity,
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SmartDiffViewer
        files={files}
        smartDiff={smartDiff}
        findingsBySeverity={findingsBySeverity}
      />
    </NextIntlClientProvider>,
  );
}

// ---- tests ----

describe("SmartDiffViewer", () => {
  it("renders groups in core → wiring → boilerplate order", () => {
    renderViewer();

    const core = screen.getByText("Core logic");
    const wiring = screen.getByText("Wiring");
    const boilerplate = screen.getByText("Boilerplate");

    expect(core).toBeInTheDocument();
    expect(wiring).toBeInTheDocument();
    expect(boilerplate).toBeInTheDocument();

    // DOM order: core must appear before wiring, wiring before boilerplate
    const all = screen.getAllByText(/^(Core logic|Wiring|Boilerplate)$/);
    expect(all[0]).toHaveTextContent("Core logic");
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

  // ---- Per-line severity badges (derived from FindingsBySeverity = Map<path, FindingRecord[]>) ----

  it("renders a 'blocker' severity badge on a CRITICAL finding line", () => {
    const finding = makeFinding({ severity: "CRITICAL", start_line: 2, end_line: 2 });
    const findingsBySeverity: FindingsBySeverity = new Map([
      ["src/core.ts", [finding]],
    ]);
    renderViewer(SMART_DIFF, ALL_PR_FILES, findingsBySeverity);
    // The core file opens by default (role === "core") so diff lines are visible
    // Line 2 of the patch is "+add1" (new-side line 2)
    // The severity badge should say "blocker"
    expect(screen.getByText("blocker")).toBeInTheDocument();
  });

  it("renders a 'warning' severity badge on a WARNING finding line", () => {
    const finding = makeFinding({ severity: "WARNING", start_line: 2, end_line: 2 });
    const findingsBySeverity: FindingsBySeverity = new Map([
      ["src/core.ts", [finding]],
    ]);
    renderViewer(SMART_DIFF, ALL_PR_FILES, findingsBySeverity);
    expect(screen.getByText("warning")).toBeInTheDocument();
  });

  it("renders 'suggestion' severity badge(s) on SUGGESTION finding lines", () => {
    const finding = makeFinding({ severity: "SUGGESTION", start_line: 2, end_line: 2 });
    const findingsBySeverity: FindingsBySeverity = new Map([
      ["src/core.ts", [finding]],
    ]);
    renderViewer(SMART_DIFF, ALL_PR_FILES, findingsBySeverity);
    // line 2 → SUGGESTION from the finding; line 3 → SUGGESTION fallback from finding_lines
    const badges = screen.getAllByText("suggestion");
    expect(badges.length).toBeGreaterThan(0);
  });

  // ---- New: "What this does" from pseudocode_summary ----

  it("renders the 'What this does' line when pseudocode_summary is set", () => {
    const diffWithSummary: SmartDiff = {
      ...SMART_DIFF,
      groups: [
        {
          role: "core",
          files: [
            {
              path: "src/core.ts",
              pseudocode_summary: "Validates user input then writes to DB",
              additions: 10,
              deletions: 2,
              finding_lines: [],
            },
          ],
        },
        WIRING_GROUP,
        BOILERPLATE_GROUP,
      ],
    };
    renderViewer(diffWithSummary);
    expect(screen.getByText("What this does:")).toBeInTheDocument();
    expect(screen.getByText("Validates user input then writes to DB")).toBeInTheDocument();
  });

  it("does not render 'What this does' when pseudocode_summary is null", () => {
    renderViewer(); // SMART_DIFF has pseudocode_summary: null on all files
    expect(screen.queryByText("What this does:")).not.toBeInTheDocument();
  });

  it("does not render the summary pill when pseudocode_summary is null", () => {
    renderViewer();
    expect(screen.queryByText("summary")).not.toBeInTheDocument();
  });

  it("renders the summary pill when pseudocode_summary is set", () => {
    const diffWithSummary: SmartDiff = {
      ...SMART_DIFF,
      groups: [
        {
          role: "core",
          files: [
            {
              path: "src/core.ts",
              pseudocode_summary: "Does something useful",
              additions: 10,
              deletions: 2,
              finding_lines: [],
            },
          ],
        },
        WIRING_GROUP,
        BOILERPLATE_GROUP,
      ],
    };
    renderViewer(diffWithSummary);
    expect(screen.getByText("summary")).toBeInTheDocument();
  });

  // ---- New: auto-expand Core files ----

  it("core file without finding_lines is still open by default (role=core always open)", () => {
    const diffCoreNoFindings: SmartDiff = {
      ...SMART_DIFF,
      groups: [
        {
          role: "core",
          files: [
            {
              path: "src/core.ts",
              pseudocode_summary: null,
              additions: 10,
              deletions: 2,
              finding_lines: [], // no findings
            },
          ],
        },
        WIRING_GROUP,
        BOILERPLATE_GROUP,
      ],
    };
    renderViewer(diffCoreNoFindings);
    // The core group is expanded; the file header should be visible
    expect(screen.getByText("src/core.ts")).toBeInTheDocument();
  });

  it("wiring file with no findings is NOT open by default", () => {
    renderViewer();
    // Wiring group is expanded (role !== boilerplate), so src/router.ts header is visible
    // BUT the file card itself should be collapsed (no findings, not core role)
    // Since the wiring section is open, the file path should be visible in the DOM
    // but the file body (diff content) should not be visible
    expect(screen.getByText("src/router.ts")).toBeInTheDocument();
    // The wiring file's diff lines ("+route1") should not be visible — card collapsed
    expect(screen.queryByText("route1")).not.toBeInTheDocument();
  });

  it("wiring file WITH findings is open by default", () => {
    const CORE_GROUP: SmartDiff["groups"][number] = {
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
    };
    const diffWiringWithFindings: SmartDiff = {
      ...SMART_DIFF,
      groups: [
        CORE_GROUP,
        {
          role: "wiring",
          files: [
            {
              path: "src/router.ts",
              pseudocode_summary: null,
              additions: 3,
              deletions: 1,
              finding_lines: [2], // has findings → should be open
            },
          ],
        },
        BOILERPLATE_GROUP,
      ],
    };
    renderViewer(diffWiringWithFindings);
    // The wiring file card should be open because finding_lines.length > 0
    // diff line content should be visible
    expect(screen.getByText("route1")).toBeInTheDocument();
  });

  // ---- New: clicking a severity badge expands InlineFinding card ----

  it("clicking a finding badge reveals the finding title and rationale", () => {
    const finding = makeFinding({
      severity: "WARNING",
      start_line: 2,
      end_line: 2,
      title: "Null pointer risk",
      rationale: "This line may throw when value is null.",
    });
    const findingsBySeverity: FindingsBySeverity = new Map([
      ["src/core.ts", [finding]],
    ]);
    renderViewer(SMART_DIFF, ALL_PR_FILES, findingsBySeverity);

    // The badge is visible (line 2 of core.ts is rendered by default)
    const badge = screen.getByRole("button", { name: /toggle finding details/i });
    expect(badge).toBeInTheDocument();
    // Finding details not yet shown
    expect(screen.queryByText("Null pointer risk")).not.toBeInTheDocument();

    // Click the badge → card expands
    fireEvent.click(badge);
    expect(screen.getByText("Null pointer risk")).toBeInTheDocument();
    expect(screen.getByText(/This line may throw/)).toBeInTheDocument();
  });

  it("clicking the badge again collapses the InlineFinding card", () => {
    const finding = makeFinding({ severity: "CRITICAL", start_line: 2, end_line: 2 });
    const findingsBySeverity: FindingsBySeverity = new Map([
      ["src/core.ts", [finding]],
    ]);
    renderViewer(SMART_DIFF, ALL_PR_FILES, findingsBySeverity);

    const badge = screen.getByRole("button", { name: /toggle finding details/i });
    // Open
    fireEvent.click(badge);
    expect(screen.getByText("Null pointer risk")).toBeInTheDocument();
    // Close
    fireEvent.click(badge);
    expect(screen.queryByText("Null pointer risk")).not.toBeInTheDocument();
  });

  it("when a line has a suggestion, 'Suggested fix' appears in the expanded card", () => {
    const finding = makeFinding({
      severity: "WARNING",
      start_line: 2,
      end_line: 2,
      suggestion: "Add a null check before dereferencing.",
    });
    const findingsBySeverity: FindingsBySeverity = new Map([
      ["src/core.ts", [finding]],
    ]);
    renderViewer(SMART_DIFF, ALL_PR_FILES, findingsBySeverity);

    const badge = screen.getByRole("button", { name: /toggle finding details/i });
    fireEvent.click(badge);
    expect(screen.getByText("Suggested fix")).toBeInTheDocument();
    expect(screen.getByText(/Add a null check/)).toBeInTheDocument();
  });

  it("original-order path (no findingsBySeverity) renders no inline finding cards", () => {
    // Render without findingsBySeverity — simulates the DiffViewer path
    renderViewer(SMART_DIFF, ALL_PR_FILES, undefined);
    // No severity badges should be visible that could toggle cards
    expect(screen.queryByRole("button", { name: /toggle finding details/i })).not.toBeInTheDocument();
  });
});
