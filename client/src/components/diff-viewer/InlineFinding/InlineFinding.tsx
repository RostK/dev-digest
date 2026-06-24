/* InlineFinding — read-only inline card revealed by clicking a finding's severity
   badge in the Smart Diff viewer. Shows severity, title, category, file:line,
   markdown rationale, and (when present) a "Suggested fix" block.

   Deliberately LOCAL to the diff-viewer folder — it must NOT import anything from
   the PR-detail page layer (wrong dependency direction). No accept/dismiss actions.

   useTranslations("prReview") is called INSIDE this component so the diff-viewer
   smoke test (which lacks prReview messages) is unaffected when InlineFinding is
   not rendered. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SeverityBadge, CategoryTag, Markdown } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import type { Severity, Category } from "@devdigest/ui";

/** CSS color token per severity level — mirrors FindingCard/constants.ts. */
const SEV_COLOR: Record<string, string> = {
  CRITICAL: "var(--crit)",
  WARNING: "var(--warn)",
  SUGGESTION: "var(--sugg)",
  INFO: "var(--info)",
};

function lineLabel(f: FindingRecord): string {
  if (f.start_line === f.end_line) return String(f.start_line);
  return `${f.start_line}–${f.end_line}`;
}

export function InlineFinding({ finding }: { finding: FindingRecord }) {
  const t = useTranslations("prReview");
  const sevColor = SEV_COLOR[finding.severity] ?? "var(--text-muted)";

  return (
    <div
      style={{
        margin: "0 0 4px 0",
        borderRadius: 6,
        borderStyle: "solid",
        borderWidth: 1,
        borderLeftWidth: 3,
        borderColor: "var(--border)",
        borderLeftColor: sevColor,
        background: "var(--bg-elevated)",
        overflow: "hidden",
      }}
    >
      {/* Header: severity badge + title + category + file:line */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          padding: "10px 14px",
        }}
      >
        <div style={{ paddingTop: 1, flexShrink: 0 }}>
          <SeverityBadge severity={finding.severity as Severity} compact />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              {finding.title}
            </span>
            <CategoryTag category={finding.category as Category} />
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              marginTop: 3,
              fontFamily: "var(--font-mono, monospace)",
            }}
          >
            {finding.file}:{lineLabel(finding)}
          </div>
        </div>
      </div>

      {/* Body: rationale + optional suggestion */}
      <div
        style={{
          padding: "10px 14px 12px",
          borderTop: "1px solid var(--border)",
        }}
      >
        <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-secondary)" }}>
          <Markdown>{finding.rationale}</Markdown>
        </div>

        {finding.suggestion && (
          <div style={{ marginTop: 10 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.05em",
                color: "var(--text-muted)",
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              {t("finding.suggestedFix")}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-secondary)" }}>
              <Markdown>{finding.suggestion}</Markdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
