/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { Severity, FindingRecord } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, fileAnchorId, DIFF_SCROLL_MARGIN_TOP, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { s, chevronFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";

/** Per-line finding info passed from Smart Diff. */
export interface FileFinding {
  line: number;
  severity: Severity;
  /** Full FindingRecord(s) for this line — present when a real review backs the line. */
  findings?: FindingRecord[];
}

/** Findings badge shown in the FileCard header when findings are present.
 *  Extracted to its own component so useTranslations("prReview") is only called
 *  when this component is actually rendered (keeps the smoke test clean). */
function FindingsBadge({
  findingCount,
  firstLine,
  filePath,
  onExpand,
}: {
  findingCount: number;
  firstLine: number | undefined;
  filePath: string;
  onExpand: () => void;
}) {
  const t = useTranslations("prReview");
  return (
    <button
      type="button"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 5,
        fontSize: 12,
        fontWeight: 600,
        color: "var(--accent)",
        background: "var(--accent-bg, rgba(99,102,241,.12))",
        cursor: "pointer",
        border: "none",
        lineHeight: 1.4,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onExpand();
        if (firstLine != null) {
          requestAnimationFrame(() => {
            const id = `sd-${filePath}-L${firstLine}`;
            // block:"start" so the line's scroll-margin-top (which clears the
            // sticky PR header) takes effect — "center" ignores scroll-margin.
            document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        }
      }}
    >
      <Icon.AlertTriangle size={12} />
      {t("smartDiff.findingsBadge", { count: findingCount })}
    </button>
  );
}

/** Small ✦ summary pill rendered inside the file header when summary is present.
 *  Isolated component so useTranslations("prReview") is only called when rendered
 *  (the flat DiffViewer path never passes `summary` → this never mounts → no
 *  "prReview" messages required → smoke test stays clean). */
function SummaryPill() {
  const t = useTranslations("prReview");
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "1px 7px",
        borderRadius: 5,
        fontSize: 11,
        fontWeight: 600,
        color: "var(--accent)",
        background: "var(--accent-bg, rgba(99,102,241,.10))",
        lineHeight: 1.5,
      }}
    >
      {/* sparkle — rendered as a text character; no lucide equivalent */}
      <span aria-hidden="true" style={{ fontSize: 10 }}>✦</span>
      {t("smartDiff.summaryPill")}
    </span>
  );
}

/** "What this does: <summary>" line rendered directly below the file card header.
 *  Same isolation rationale as SummaryPill above. */
function SummaryLine({ summary }: { summary: string }) {
  const t = useTranslations("prReview");
  return (
    <div
      style={{
        fontSize: 12,
        color: "var(--text-muted)",
        padding: "4px 12px 6px 12px",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>
        {t("smartDiff.whatThisDoes")}
      </span>{" "}
      {summary}
    </div>
  );
}

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

export function FileCard({
  file,
  commenting,
  findings,
  findingLines,
  defaultOpen,
  summary,
  focused,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  /** Per-line findings with severity (Smart Diff). Takes precedence over findingLines. */
  findings?: FileFinding[];
  /** Legacy: new-side line numbers that have findings (Smart Diff, no severity).
   *  When `findings` is provided this is ignored. Keep for backward compat. */
  findingLines?: number[];
  /** Override the default auto-expand heuristic. */
  defaultOpen?: boolean;
  /** Pseudocode summary from the smart diff (shown under the header). */
  summary?: string | null;
  /** This card is the deep-link target (?tab=diff&file=…) — force it open and
   *  scroll it into view when it becomes focused. */
  focused?: boolean;
}) {
  const t = useTranslations("shell");

  // Resolve the effective set of finding lines (from `findings` or legacy `findingLines`)
  const effectiveFindings: FileFinding[] = React.useMemo(() => {
    if (findings && findings.length > 0) return findings;
    if (findingLines && findingLines.length > 0) {
      return findingLines.map((line) => ({ line, severity: "SUGGESTION" as Severity }));
    }
    return [];
  }, [findings, findingLines]);

  const effectiveFindingLines = React.useMemo(
    () => effectiveFindings.map((f) => f.line),
    [effectiveFindings],
  );

  const [open, setOpen] = React.useState(
    focused || (defaultOpen ?? (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES)
  );

  // Deep-link target: when this file becomes focused (initial mount OR the ?file=
  // param later points here while the tab is already open), expand it and scroll
  // it into view. rAF defers the scroll until the just-expanded body is laid out.
  React.useEffect(() => {
    if (!focused) return;
    setOpen(true);
    const el = document.getElementById(fileAnchorId(file.path));
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [focused, file.path]);
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, lines]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  // Finding status dot: show when there are findings; color = crit if any CRITICAL else warn
  const hasCritical = effectiveFindings.some((f) => f.severity === "CRITICAL");
  const statusDotColor = hasCritical ? "var(--crit)" : "var(--warn)";

  // Build a per-line lookup for severity + full records in O(1)
  const findingsByLine = React.useMemo(() => {
    const map = new Map<number, { severity: Severity; findings?: FindingRecord[] }>();
    for (const f of effectiveFindings) map.set(f.line, { severity: f.severity, findings: f.findings });
    return map;
  }, [effectiveFindings]);

  const hasSummary = !!summary;

  return (
    <div style={{ ...s.fileCard, scrollMarginTop: DIFF_SCROLL_MARGIN_TOP }} id={fileAnchorId(file.path)}>
      <div onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        {/* Status dot — shown when findings exist */}
        {effectiveFindings.length > 0 && (
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: statusDotColor,
              flexShrink: 0,
              marginRight: 2,
            }}
          />
        )}
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
        {/* Summary pill — only rendered when summary is non-empty */}
        {hasSummary && <SummaryPill />}
        {effectiveFindings.length > 0 && (
          <FindingsBadge
            findingCount={effectiveFindings.length}
            firstLine={effectiveFindingLines[0]}
            filePath={file.path}
            onExpand={() => setOpen(true)}
          />
        )}
      </div>

      {/* "What this does" line — rendered directly below the header when summary is present */}
      {hasSummary && <SummaryLine summary={summary!} />}

      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => {
              const isHighlight =
                effectiveFindingLines.length > 0 &&
                ln.newNo != null &&
                effectiveFindingLines.includes(ln.newNo);
              const anchorId = isHighlight && ln.newNo != null
                ? `sd-${file.path}-L${ln.newNo}`
                : undefined;
              const lineEntry = ln.newNo != null ? findingsByLine.get(ln.newNo) : undefined;
              return (
                <CodeLine
                  key={i}
                  ln={ln}
                  path={file.path}
                  threads={threadsForLine(ln, matched)}
                  commenting={commenting}
                  highlight={isHighlight}
                  anchorId={anchorId}
                  severity={isHighlight ? lineEntry?.severity : undefined}
                  findings={isHighlight ? lineEntry?.findings : undefined}
                />
              );
            })
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
        </div>
      )}
    </div>
  );
}
