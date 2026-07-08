/* Small shared presentational badges for ColumnsView + TabsView. Both convey
   their meaning by label/icon, never color alone (AC-20): the status badge
   pairs an icon with a text label, and the score badge's number is itself the
   accessible label (not a bare color swatch). */
"use client";

import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@devdigest/ui";
import type { AgentColumn } from "@devdigest/shared";
import { s } from "./styles";

const STATUS_ICON: Record<AgentColumn["status"], IconName> = {
  running: "RefreshCw",
  done: "CheckCircle",
  failed: "XCircle",
};

export function AgentStatusBadge({ status }: { status: AgentColumn["status"] }) {
  const t = useTranslations("multiAgentReview");
  const I = Icon[STATUS_ICON[status]];
  return (
    <span style={s.statusBadge(status)}>
      <I size={13} style={status === "running" ? { animation: "ddspin 1s linear infinite" } : undefined} />
      {t(`status.${status}`)}
    </span>
  );
}

export function ScoreBadge({ score, compact }: { score: number | null; compact?: boolean }) {
  const t = useTranslations("multiAgentReview");
  if (score == null) return null;
  const tier = score >= 75 ? "ok" : score >= 50 ? "warn" : "crit";
  const label = t("column.score", { score });
  return (
    <span style={s.scoreBadge(tier, compact)} title={label} aria-label={label}>
      {label}
    </span>
  );
}
