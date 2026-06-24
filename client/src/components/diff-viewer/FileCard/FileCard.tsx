/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, type Line } from "../helpers";
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

/** Findings badge shown in the FileCard header when finding_lines are present.
 *  Extracted to its own component so useTranslations("prReview") is only called
 *  when this component is actually rendered (keeps the smoke test clean). */
function FindingsBadge({
  findingLines,
  filePath,
  onExpand,
}: {
  findingLines: number[];
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
        const firstLine = findingLines[0];
        if (firstLine != null) {
          requestAnimationFrame(() => {
            const id = `sd-${filePath}-L${firstLine}`;
            document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
          });
        }
      }}
    >
      <Icon.AlertTriangle size={12} />
      {t("smartDiff.findingsBadge", { count: findingLines.length })}
    </button>
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
  findingLines,
  defaultOpen,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  /** New-side line numbers that have findings (Smart Diff). */
  findingLines?: number[];
  /** Override the default auto-expand heuristic. */
  defaultOpen?: boolean;
}) {
  const t = useTranslations("shell");
  const [open, setOpen] = React.useState(
    defaultOpen ?? (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
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

  return (
    <div style={s.fileCard}>
      <div onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
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
        {findingLines && findingLines.length > 0 && (
          <FindingsBadge
            findingLines={findingLines}
            filePath={file.path}
            onExpand={() => setOpen(true)}
          />
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => {
              const isHighlight =
                findingLines != null &&
                ln.newNo != null &&
                findingLines.includes(ln.newNo);
              const anchorId = isHighlight && ln.newNo != null
                ? `sd-${file.path}-L${ln.newNo}`
                : undefined;
              return (
                <CodeLine
                  key={i}
                  ln={ln}
                  path={file.path}
                  threads={threadsForLine(ln, matched)}
                  commenting={commenting}
                  highlight={isHighlight}
                  anchorId={anchorId}
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
