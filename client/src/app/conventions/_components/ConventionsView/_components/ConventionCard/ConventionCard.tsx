/* ConventionCard — one grounded candidate: rule, file:line → GitHub, the verbatim
   snippet, a confidence bar, and Accept / Reject. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, ProgressBar } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { evidenceRange } from "@/lib/convention-skill";
import { s } from "./styles";

const CATEGORY_COLOR: Record<string, string> = {
  naming: "#8b5cf6",
  error_handling: "var(--crit)",
  structure: "#3b82f6",
  imports: "#06b6d4",
  typing: "#f59e0b",
  testing: "#10b981",
  async: "#ec4899",
  style: "var(--text-muted)",
  other: "var(--text-muted)",
};

function confidenceColor(pct: number): string {
  if (pct >= 70) return "#10b981";
  if (pct >= 40) return "var(--accent)";
  return "var(--text-muted)";
}

export function ConventionCard({
  convention: c,
  repoFullName,
  defaultBranch,
  onAccept,
}: {
  convention: ConventionCandidate;
  repoFullName: string;
  defaultBranch: string;
  onAccept: (accepted: boolean) => void;
}) {
  const t = useTranslations("conventions");
  const pct = Math.round((c.confidence ?? 0) * 100);
  const href =
    repoFullName && c.evidence_path
      ? githubBlobUrl(
          repoFullName,
          defaultBranch,
          c.evidence_path,
          c.evidence_start_line ?? undefined,
          c.evidence_end_line ?? undefined,
        )
      : undefined;

  return (
    <div style={s.card(c.accepted)}>
      <div style={s.main}>
        <div style={s.titleRow}>
          <span style={s.rule}>{c.rule}</span>
          <Badge color={CATEGORY_COLOR[c.category] ?? "var(--text-muted)"}>
            {c.category.replace(/_/g, " ")}
          </Badge>
        </div>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="mono"
            style={s.evidence}
            title={t("card.viewSource")}
          >
            {evidenceRange(c)}
            <Icon.ExternalLink size={11} />
          </a>
        ) : (
          <span className="mono" style={s.evidence}>
            {evidenceRange(c)}
          </span>
        )}
        <pre className="mono" style={s.snippet}>
          {c.evidence_snippet}
        </pre>
        <div style={s.confidenceRow}>
          <span style={s.confidenceLabel}>{t("card.confidence")}</span>
          <div style={s.bar}>
            <ProgressBar value={pct} color={confidenceColor(pct)} />
          </div>
          <span className="mono tnum" style={s.pct}>
            {pct}%
          </span>
        </div>
      </div>
      <div style={s.actions}>
        <Button
          kind={c.accepted ? "primary" : "secondary"}
          size="sm"
          icon="Check"
          full
          onClick={() => onAccept(true)}
        >
          {c.accepted ? t("card.accepted") : t("card.accept")}
        </Button>
        <Button kind="ghost" size="sm" icon="X" full onClick={() => onAccept(false)}>
          {t("card.reject")}
        </Button>
      </div>
    </div>
  );
}
