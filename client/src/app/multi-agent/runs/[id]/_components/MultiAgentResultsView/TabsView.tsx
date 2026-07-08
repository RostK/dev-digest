/* TabsView — a tab per agent (name + score badge); the active tab shows a
   summary card (score, one-line verdict/summary, View trace, duration·cost)
   then expandable finding cards, reusing T5's AgentFindingCard with each
   AgentColumnFinding enriched to its full FindingRecord (via findingMap). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { AgentColumn, FindingRecord } from "@devdigest/shared";
import { AgentFindingCard } from "@/app/multi-agent/_components/AgentFindingCard";
import { formatCostCompact } from "@/components/RunCostBadge";
import { AgentStatusBadge, ScoreBadge } from "./StatusBadges";
import { formatDurationLabel } from "./helpers";
import { s } from "./styles";

export interface TabsViewProps {
  columns: AgentColumn[];
  prId: string;
  findingMap: Map<string, FindingRecord>;
  onOpenTrace: (runId: string) => void;
}

export function TabsView({ columns, prId, findingMap, onOpenTrace }: TabsViewProps) {
  const t = useTranslations("multiAgentReview");
  const [activeId, setActiveId] = React.useState<string | undefined>(columns[0]?.run_id);
  const active = columns.find((c) => c.run_id === activeId) ?? columns[0];

  if (!active) return null;

  return (
    <div style={s.tabsWrap}>
      <div style={s.tabStrip} role="tablist" aria-label={t("tabs.label")}>
        {columns.map((col) => (
          <button
            key={col.run_id}
            type="button"
            role="tab"
            aria-selected={col.run_id === active.run_id}
            style={s.tabButton(col.run_id === active.run_id)}
            onClick={() => setActiveId(col.run_id)}
          >
            <span>{col.agent_name}</span>
            <ScoreBadge score={col.score} compact />
          </button>
        ))}
      </div>

      <div style={s.summaryCard}>
        <div style={s.summaryTop}>
          <ScoreBadge score={active.score} />
          <AgentStatusBadge status={active.status} />
        </div>
        <p style={s.summaryText}>{active.summary ?? t("tabs.noSummary")}</p>
        <div style={s.summaryMeta}>
          <span>
            {t("column.metaLine", {
              duration: formatDurationLabel(active.duration_ms),
              cost: formatCostCompact(active.cost_usd),
            })}
          </span>
          <Button kind="ghost" size="sm" icon="ExternalLink" onClick={() => onOpenTrace(active.run_id)}>
            {t("column.viewTrace")}
          </Button>
        </div>
      </div>

      <div style={s.cardsList}>
        {active.findings.length === 0 ? (
          <div style={s.emptyFindings}>{t("column.noFindings")}</div>
        ) : (
          active.findings.map((f) => {
            const enriched = findingMap.get(f.id);
            if (!enriched) return null;
            return (
              <AgentFindingCard
                key={f.id}
                finding={enriched}
                agentName={active.agent_name}
                prId={prId}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
