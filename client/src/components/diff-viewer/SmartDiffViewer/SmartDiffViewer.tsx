/* SmartDiffViewer — reviewer-ordered diff: files grouped by role (core / wiring /
   boilerplate). Boilerplate section is collapsed by default. Files with finding
   lines show a clickable badge that expands the card and scrolls to the first hit. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { SmartDiff, SmartDiffRole, Severity } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import type { DiffCommentApi } from "../comments";
import { FileCard } from "../FileCard";
import { s } from "./styles";

/* ---------- types ---------- */

/** Per-line severity info derived from review findings, keyed by new-side line number. */
export type FileFindingMap = Map<number, Severity>;

/** Per-file map of line → severity, keyed by file path. */
export type FindingsBySeverity = Map<string, FileFindingMap>;

export interface SmartDiffViewerProps {
  files: PrFile[];
  smartDiff: SmartDiff;
  commenting?: DiffCommentApi;
  /** Per-file, per-line severity from review findings. When omitted nothing changes. */
  findingsBySeverity?: FindingsBySeverity;
}

/* ---------- role display map ---------- */
const ROLE_LABEL_KEY: Record<SmartDiffRole, "smartDiff.coreLabel" | "smartDiff.wiringLabel" | "smartDiff.boilerplateLabel"> = {
  core: "smartDiff.coreLabel",
  wiring: "smartDiff.wiringLabel",
  boilerplate: "smartDiff.boilerplateLabel",
};

const ROLE_DESC_KEY: Record<SmartDiffRole, "smartDiff.coreDesc" | "smartDiff.wiringDesc" | "smartDiff.boilerplateDesc"> = {
  core: "smartDiff.coreDesc",
  wiring: "smartDiff.wiringDesc",
  boilerplate: "smartDiff.boilerplateDesc",
};

/** Token color for the role-group bullet. */
const ROLE_BULLET_COLOR: Record<SmartDiffRole, string> = {
  core: "var(--accent)",
  wiring: "var(--warn)",
  boilerplate: "var(--text-muted)",
};

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
}: {
  role: SmartDiffRole;
  files: { path: string; finding_lines: number[]; pseudocode_summary?: string | null }[];
  allPrFiles: PrFile[];
  commenting?: DiffCommentApi;
  startOpen: boolean;
  findingsBySeverity?: FindingsBySeverity;
}) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(startOpen);

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

            // Core files always open; wiring/boilerplate open only when they have findings
            const cardDefaultOpen =
              role === "core" || sdFile.finding_lines.length > 0;

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

/**
 * Merge smart-diff finding_lines (which have no severity) with the review-derived
 * per-line severity map into a unified findings array for FileCard.
 * Lines in finding_lines but NOT in the severity map get severity "SUGGESTION" as
 * a safe fallback so the highlight still appears.
 */
function buildFileFindings(
  findingLines: number[],
  lineSeverityMap: FileFindingMap | undefined,
): { line: number; severity: Severity }[] {
  // Union of lines from both sources
  const lineSet = new Set<number>(findingLines);
  if (lineSeverityMap) {
    for (const line of lineSeverityMap.keys()) lineSet.add(line);
  }

  return Array.from(lineSet).map((line) => ({
    line,
    severity: lineSeverityMap?.get(line) ?? "SUGGESTION",
  }));
}

/* ---------- SmartDiffViewer ---------- */
export function SmartDiffViewer({
  files,
  smartDiff,
  commenting,
  findingsBySeverity,
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
        />
      ))}
    </div>
  );
}
