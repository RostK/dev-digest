/* ColumnsView — one column per agent (AC-12): header (name, score badge,
   live status, duration·cost), light finding rows (title + file:line), and a
   footer `View trace` + "N findings". Purely presentational — the parent
   overlays live status onto `columns` before it reaches here. */
"use client";

import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { AgentColumn } from "@devdigest/shared";
import { formatCostCompact } from "@/components/RunCostBadge";
import { AgentStatusBadge, ScoreBadge } from "./StatusBadges";
import { formatDurationLabel } from "./helpers";
import { s } from "./styles";

export interface ColumnsViewProps {
  columns: AgentColumn[];
  onOpenTrace: (runId: string) => void;
}

export function ColumnsView({ columns, onOpenTrace }: ColumnsViewProps) {
  const t = useTranslations("multiAgentReview");
  return (
    <div style={s.columnsGrid}>
      {columns.map((col) => (
        <div key={col.run_id} style={s.column}>
          <div style={s.columnHeader}>
            <div style={s.columnHeaderTop}>
              <span style={s.agentName}>{col.agent_name}</span>
              <ScoreBadge score={col.score} />
            </div>
            <AgentStatusBadge status={col.status} />
            <span style={s.metaLine}>
              {t("column.metaLine", {
                duration: formatDurationLabel(col.duration_ms),
                cost: formatCostCompact(col.cost_usd),
              })}
            </span>
          </div>

          <div style={s.findingsList}>
            {col.findings.length === 0 ? (
              <div style={s.emptyFindings}>{t("column.noFindings")}</div>
            ) : (
              col.findings.map((f) => (
                <div key={f.id} style={s.findingRow}>
                  <span style={s.findingTitle}>{f.title}</span>
                  <span className="mono" style={s.findingLoc}>
                    {f.file}:{f.start_line}
                  </span>
                </div>
              ))
            )}
          </div>

          <div style={s.columnFooter}>
            <Button kind="ghost" size="sm" icon="ExternalLink" onClick={() => onOpenTrace(col.run_id)}>
              {t("column.viewTrace")}
            </Button>
            <span style={s.findingsCount}>{t("column.findingsCount", { count: col.findings.length })}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
