/* SmartDiffViewer — reviewer-ordered diff: files grouped by role (core / wiring /
   config / test / boilerplate). Boilerplate section is collapsed by default. Files
   with finding lines show a clickable badge that expands the card and scrolls to
   the first hit. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { SmartDiff, SmartDiffRole, FindingRecord, Severity } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import type { DiffCommentApi } from "../comments";
import { FileCard } from "../FileCard";
import type { FileFinding } from "../FileCard";
import { s } from "./styles";

/* ---------- types ---------- */

/** Full findings (FindingRecord[]) keyed by file path. */
export type FindingsBySeverity = Map<string, FindingRecord[]>;

export interface SmartDiffViewerProps {
  files: PrFile[];
  smartDiff: SmartDiff;
  commenting?: DiffCommentApi;
  /** Per-file findings (full FindingRecord) from review data. When omitted nothing changes. */
  findingsBySeverity?: FindingsBySeverity;
  /** File path to force-open (its role group AND file card) — deep-link scroll target
   *  from DiffTab's ?file=&line=. Doesn't change default behavior for other files. */
  focusPath?: string | null;
}

/* ---------- role display map ---------- */
// `satisfies` keeps the exhaustive-role check AND the exact literal key types,
// so a typo'd i18n key is a compile error (not just a next-intl runtime throw).
const ROLE_LABEL_KEY = {
  core: "smartDiff.coreLabel",
  wiring: "smartDiff.wiringLabel",
  config: "smartDiff.configLabel",
  test: "smartDiff.testLabel",
  boilerplate: "smartDiff.boilerplateLabel",
} as const satisfies Record<SmartDiffRole, string>;

const ROLE_DESC_KEY = {
  core: "smartDiff.coreDesc",
  wiring: "smartDiff.wiringDesc",
  config: "smartDiff.configDesc",
  test: "smartDiff.testDesc",
  boilerplate: "smartDiff.boilerplateDesc",
} as const satisfies Record<SmartDiffRole, string>;

/** Token color for the role-group bullet. */
const ROLE_BULLET_COLOR = {
  core: "var(--accent)",
  wiring: "var(--warn)",
  config: "var(--accent-text)",
  test: "var(--ok)",
  boilerplate: "var(--text-muted)",
} as const satisfies Record<SmartDiffRole, string>;

/* ---------- SplitBanner ---------- */
function SplitBanner({
  totalLines,
  splits,
}: {
  totalLines: number;
  splits: { name: string; files: string[] }[];
}) {
  const t = useTranslations("prReview");
  return (
    <div style={s.banner} role="alert">
      <div style={s.bannerTitle}>
        {t("smartDiff.largeTitle", { lines: totalLines })}
      </div>
      <div style={s.bannerBody}>{t("smartDiff.largeBody")}</div>
      {splits.length > 0 && (
        <ul style={s.bannerSplits}>
          {splits.map((sp) => (
            <li key={sp.name} style={s.bannerSplitItem}>
              <strong>{sp.name}</strong>
              {sp.files.length > 0 && (
                <span style={s.bannerSplitFiles}>
                  ({sp.files.join(", ")})
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- RoleGroup ---------- */
function RoleGroup({
  role,
  files,
  allPrFiles,
  commenting,
  startOpen,
  findingsBySeverity,
  focusPath,
}: {
  role: SmartDiffRole;
  files: { path: string; finding_lines: number[]; pseudocode_summary?: string | null }[];
  allPrFiles: PrFile[];
  commenting?: DiffCommentApi;
  startOpen: boolean;
  findingsBySeverity?: FindingsBySeverity;
  /** Force this group open when it contains the deep-link focus file (even boilerplate). */
  focusPath?: string | null;
}) {
  const t = useTranslations("prReview");
  const containsFocusFile = !!focusPath && files.some((f) => f.path === focusPath);
  const [open, setOpen] = React.useState(startOpen || containsFocusFile);

  const label = t(ROLE_LABEL_KEY[role]);
  const desc = t(ROLE_DESC_KEY[role]);
  const count = t("smartDiff.filesCount", { count: files.length });
  const bulletColor = ROLE_BULLET_COLOR[role];

  return (
    <div style={s.group}>
      <div
        style={s.groupHeader}
        onClick={() => setOpen((o) => !o)}
        role="button"
        aria-expanded={open}
        aria-label={label}
      >
        <Icon.ChevronRight
          size={13}
          style={{
            ...s.groupChevron,
            transform: open ? "rotate(90deg)" : "none",
          }}
        />
        {/* Colored square bullet */}
        <span
          style={{ ...s.roleBullet, background: bulletColor }}
          aria-hidden="true"
        />
        <span style={s.groupTitle}>{label}</span>
        <span style={s.groupDesc}>{desc}</span>
        <span style={s.groupCount}>{count}</span>
      </div>

      {open && (
        <div style={s.fileList}>
          {files.map((sdFile) => {
            const prFile = allPrFiles.find((f) => f.path === sdFile.path);
            if (!prFile) return null;

            // Build findings array from per-line severity map + smart diff finding_lines
            const fileFindings = buildFileFindings(
              sdFile.finding_lines,
              findingsBySeverity?.get(sdFile.path),
            );

            // Core files always open; wiring/boilerplate open only when they have findings;
            // the deep-link focus file's card is always force-opened too.
            const cardDefaultOpen =
              role === "core" ||
              sdFile.finding_lines.length > 0 ||
              sdFile.path === focusPath;

            return (
              <FileCard
                key={sdFile.path}
                file={prFile}
                commenting={commenting}
                findings={fileFindings}
                defaultOpen={cardDefaultOpen}
                summary={sdFile.pseudocode_summary ?? null}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Severity ranking for tie-breaking when multiple findings are on the same line. */
function severityRank(s: Severity): number {
  if (s === "CRITICAL") return 3;
  if (s === "WARNING") return 2;
  return 1;
}

/**
 * Merge smart-diff finding_lines (which have no severity) with the review-derived
 * per-file FindingRecord[] into a unified findings array for FileCard.
 *
 * Lines in finding_lines but NOT in fileFindings get severity "SUGGESTION" as a
 * safe fallback so the highlight still appears. Lines that DO have FindingRecord[]
 * carry the full records for the InlineFinding inline card toggle.
 */
export function buildFileFindings(
  findingLines: number[],
  fileFindings: FindingRecord[] | undefined,
): FileFinding[] {
  // Group full FindingRecord[] by start_line for O(1) lookup
  const byLine = new Map<number, FindingRecord[]>();
  if (fileFindings) {
    for (const f of fileFindings) {
      if (f.start_line == null) continue;
      const existing = byLine.get(f.start_line) ?? [];
      existing.push(f);
      byLine.set(f.start_line, existing);
    }
  }

  // Union of lines from both sources
  const lineSet = new Set<number>(findingLines);
  for (const line of byLine.keys()) lineSet.add(line);

  return Array.from(lineSet).map((line) => {
    const records = byLine.get(line);
    // Most-severe severity for the badge color
    const severity: Severity = records
      ? records.reduce<Severity>(
          (best, r) =>
            severityRank(r.severity) > severityRank(best) ? r.severity : best,
          "SUGGESTION",
        )
      : "SUGGESTION";
    return { line, severity, findings: records };
  });
}

/* ---------- SmartDiffViewer ---------- */
export function SmartDiffViewer({
  files,
  smartDiff,
  commenting,
  findingsBySeverity,
  focusPath,
}: SmartDiffViewerProps) {
  const { split_suggestion } = smartDiff;

  return (
    <div style={s.container}>
      {split_suggestion.too_big && (
        <SplitBanner
          totalLines={split_suggestion.total_lines}
          splits={split_suggestion.proposed_splits}
        />
      )}

      {smartDiff.groups.map((group) => (
        <RoleGroup
          key={group.role}
          role={group.role}
          files={group.files}
          allPrFiles={files}
          commenting={commenting}
          startOpen={group.role !== "boilerplate"}
          findingsBySeverity={findingsBySeverity}
          focusPath={focusPath}
        />
      ))}
    </div>
  );
}
