/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored comment threads, and an inline composer.
   When a finding's severity badge is clicked, InlineFinding cards expand below
   the line (one per finding on that line). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { commentTargetFor, type CommentThread, type DiffCommentApi, cs } from "../comments";
import { type Line } from "../helpers";
import { s, lineRowFor, lineSignFor } from "../styles";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";
import { InlineFinding } from "../InlineFinding";
import type { Severity, FindingRecord } from "@devdigest/shared";

/** Token color + label per severity level. */
const SEVERITY_DISPLAY: Record<
  Severity,
  { labelKey: "smartDiff.sevBlocker" | "smartDiff.sevWarning" | "smartDiff.sevSuggestion"; color: string }
> = {
  CRITICAL: { labelKey: "smartDiff.sevBlocker", color: "var(--crit)" },
  WARNING: { labelKey: "smartDiff.sevWarning", color: "var(--warn)" },
  SUGGESTION: { labelKey: "smartDiff.sevSuggestion", color: "var(--sugg, var(--info, #6b7280))" },
};

/**
 * Clickable severity badge that toggles the InlineFinding card(s) below.
 * Isolated component so useTranslations("prReview") is only called when
 * a finding line is actually rendered (keeps the smoke test clean).
 */
function SeverityBadge({
  severity,
  expanded,
  onToggle,
}: {
  severity: Severity;
  expanded: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("prReview");
  const { labelKey, color } = SEVERITY_DISPLAY[severity];
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-label={t("smartDiff.findingDetails")}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "1px 6px",
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 700,
        lineHeight: 1.5,
        color,
        background: "var(--bg-elevated, rgba(0,0,0,.06))",
        border: `1px solid ${color}`,
        marginLeft: "auto",
        flexShrink: 0,
        letterSpacing: "0.03em",
        textTransform: "uppercase",
        cursor: "pointer",
      }}
    >
      {t(labelKey)}
    </button>
  );
}

export function CodeLine({
  ln,
  path,
  threads,
  commenting,
  highlight,
  anchorId,
  severity,
  findings,
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  commenting?: DiffCommentApi;
  /** True when this line is a Smart Diff finding line (accent highlight). */
  highlight?: boolean;
  /** DOM id for the row wrapper, used for scroll-to-finding. */
  anchorId?: string;
  /** Severity of the finding on this line — renders an inline badge when set. */
  severity?: Severity;
  /** Full FindingRecord(s) for this line — when present, clicking the badge
   *  expands inline detail cards below the line. */
  findings?: FindingRecord[];
}) {
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);
  const [findingsOpen, setFindingsOpen] = React.useState(false);

  if (ln.kind === "hunk") {
    return (
      <div className="mono" style={s.hunk}>
        {ln.text}
      </div>
    );
  }

  const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
  const target = commenting?.canComment ? commentTargetFor(ln) : null;
  const showAdd = hover && !!target && !composing;

  const highlightStyle: React.CSSProperties = highlight
    ? { borderLeft: "3px solid var(--accent)", background: "var(--accent-bg, rgba(99,102,241,.08))" }
    : {};

  const hasFindings = highlight && severity;
  const hasFullFindings = hasFindings && findings && findings.length > 0;

  return (
    <div
      id={anchorId}
      style={{ ...cs.rowWrap, ...highlightStyle }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={{ ...lineRowFor(ln.kind), display: "flex", alignItems: "center" }}>
        <span className="mono tnum" style={{ ...s.lineNo, position: "relative" }}>
          {showAdd && target && (
            <button
              type="button"
              title="Add a comment on this line"
              aria-label="Add a comment on this line"
              onClick={() => setComposing(true)}
              style={cs.addBtn}
            >
              +
            </button>
          )}
          {ln.newNo ?? ln.oldNo ?? ""}
        </span>
        <span className="mono" style={lineSignFor(ln.kind)}>
          {sign}
        </span>
        <span className="mono" style={{ ...s.lineText, flex: 1 }}>
          {ln.text || " "}
        </span>
        {/* Clickable severity badge — right-aligned, shown on finding lines.
            When full FindingRecord(s) are present it toggles inline cards;
            otherwise it is a non-interactive label (no toggle handler). */}
        {hasFindings && (
          hasFullFindings ? (
            <SeverityBadge
              severity={severity}
              expanded={findingsOpen}
              onToggle={() => setFindingsOpen((v) => !v)}
            />
          ) : (
            /* Fallback: no full records available — render as plain label */
            <SeverityLabel severity={severity} />
          )
        )}
      </div>

      {/* Inline finding cards — rendered directly below the line row */}
      {hasFullFindings && findingsOpen && (
        <div
          style={{
            padding: "6px 12px 6px 16px",
            background: "var(--bg-surface)",
            borderTop: "1px solid var(--border)",
          }}
        >
          {findings.map((f) => (
            <InlineFinding key={f.id} finding={f} />
          ))}
        </div>
      )}

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {commenting && composing && target && (
        <InlineComposer
          commenting={commenting}
          path={path}
          line={target.line}
          side={target.side}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  );
}

/**
 * Non-interactive severity label — shown when a line has severity but no full
 * FindingRecord (e.g. severity derived from smart-diff's finding_lines fallback).
 * Isolated so useTranslations("prReview") is only called on finding lines.
 */
function SeverityLabel({ severity }: { severity: Severity }) {
  const t = useTranslations("prReview");
  const { labelKey, color } = SEVERITY_DISPLAY[severity];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "1px 6px",
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 700,
        lineHeight: 1.5,
        color,
        background: "var(--bg-elevated, rgba(0,0,0,.06))",
        border: `1px solid ${color}`,
        marginLeft: "auto",
        flexShrink: 0,
        letterSpacing: "0.03em",
        textTransform: "uppercase",
      }}
    >
      {t(labelKey)}
    </span>
  );
}
