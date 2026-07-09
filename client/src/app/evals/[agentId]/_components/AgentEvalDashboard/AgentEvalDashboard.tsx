/* AgentEvalDashboard — per-agent eval dashboard (A4, L06). Metric trend chart
   + recent-runs table with checkbox row-selection driving a 2-run Compare
   modal (both `system_prompt` snapshots as a diff). Reads from
   `useAgentEvalDashboard(agentId)` + `useAgentEvalRuns(agentId)` — no fetch in
   this component. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon, Skeleton, ErrorState, EmptyState, SectionLabel, Button, Checkbox } from "@devdigest/ui";
import { LineChart, MetricCard } from "@devdigest/ui";
import { useAgentEvalDashboard, useAgentEvalRuns } from "@/lib/hooks/evals";
import { formatCostCompact } from "@/components/RunCostBadge";
import { pct } from "@/app/evals/helpers";
import { CompareModal } from "./_components/CompareModal";
import { s } from "./styles";

export function AgentEvalDashboard({ agentId }: { agentId: string }) {
  const t = useTranslations("evals");
  const dashboardQ = useAgentEvalDashboard(agentId);
  const runsQ = useAgentEvalRuns(agentId);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [comparing, setComparing] = React.useState<[string, string] | null>(null);

  function toggleRun(groupId: string) {
    setSelected((prev) => {
      if (prev.includes(groupId)) return prev.filter((id) => id !== groupId);
      if (prev.length >= 2) return [prev[1]!, groupId];
      return [...prev, groupId];
    });
  }

  const isLoading = dashboardQ.isLoading || runsQ.isLoading;
  const isError = dashboardQ.isError || runsQ.isError;

  return (
    <div style={s.page}>
      <Link href="/evals" style={s.backLink}>
        {t("agentDashboard.backToGlobal")}
      </Link>

      <div style={s.header}>
        <div style={s.title}>
          <Icon.Gauge size={20} style={{ color: "var(--accent)" }} />
          {t("agentDashboard.title")}
        </div>
        {dashboardQ.data && (
          <div style={s.subtitle}>{t("agentDashboard.casesSummary", { count: dashboardQ.data.cases_total })}</div>
        )}
      </div>

      {isLoading && (
        <div style={s.loading}>
          <Skeleton height={100} />
          <Skeleton height={220} />
          <Skeleton height={200} />
        </div>
      )}

      {isError && !isLoading && (
        <ErrorState
          fullScreen
          title={t("agentDashboard.error")}
          onRetry={() => {
            dashboardQ.refetch();
            runsQ.refetch();
          }}
        />
      )}

      {!isLoading && !isError && dashboardQ.data && (
        <>
          {dashboardQ.data.alert && (
            <div style={s.alertBanner}>
              <Icon.AlertTriangle size={15} style={{ color: "var(--warn)", flexShrink: 0, marginTop: 1 }} />
              <span>{dashboardQ.data.alert}</span>
            </div>
          )}

          {dashboardQ.data.cases_total === 0 ? (
            <EmptyState
              icon="Gauge"
              title={t("agentDashboard.empty.title")}
              body={t("agentDashboard.empty.body")}
            />
          ) : (
            <>
              <div style={s.metricRow}>
                <MetricCard
                  label={t("agentDashboard.legend.recall")}
                  value={pct(dashboardQ.data.current.recall)}
                  delta={dashboardQ.data.delta.recall}
                  color="var(--accent)"
                  trend={dashboardQ.data.trend.map((p) => p.recall)}
                />
                <MetricCard
                  label={t("agentDashboard.legend.precision")}
                  value={pct(dashboardQ.data.current.precision)}
                  delta={dashboardQ.data.delta.precision}
                  color="var(--ok)"
                  trend={dashboardQ.data.trend.map((p) => p.precision)}
                />
                <MetricCard
                  label={t("agentDashboard.legend.citation")}
                  value={pct(dashboardQ.data.current.citation_accuracy)}
                  delta={dashboardQ.data.delta.citation_accuracy}
                  color="var(--warn)"
                  trend={dashboardQ.data.trend.map((p) => p.citation_accuracy)}
                />
              </div>

              {dashboardQ.data.trend.length > 1 && (
                <div style={s.section}>
                  <SectionLabel icon="TrendingUp">{t("agentDashboard.trendHeading")}</SectionLabel>
                  <div style={s.card}>
                    <div style={s.legendRow}>
                      <span style={s.legendItem()}>
                        <span style={s.legendDot("var(--accent)")} />
                        {t("agentDashboard.legend.recall")}
                      </span>
                      <span style={s.legendItem()}>
                        <span style={s.legendDot("var(--ok)")} />
                        {t("agentDashboard.legend.precision")}
                      </span>
                      <span style={s.legendItem()}>
                        <span style={s.legendDot("var(--warn)")} />
                        {t("agentDashboard.legend.citation")}
                      </span>
                    </div>
                    <LineChart
                      series={[
                        { name: "recall", color: "var(--accent)", data: dashboardQ.data.trend.map((p) => p.recall) },
                        {
                          name: "precision",
                          color: "var(--ok)",
                          data: dashboardQ.data.trend.map((p) => p.precision),
                        },
                        {
                          name: "citation",
                          color: "var(--warn)",
                          data: dashboardQ.data.trend.map((p) => p.citation_accuracy),
                        },
                      ]}
                    />
                  </div>
                </div>
              )}

              <div style={s.section}>
                <div style={s.compareBar}>
                  <SectionLabel icon="History">{t("agentDashboard.recentRunsHeading")}</SectionLabel>
                  <Button
                    kind="secondary"
                    size="sm"
                    icon="Layers"
                    disabled={selected.length !== 2}
                    onClick={() => selected.length === 2 && setComparing([selected[0]!, selected[1]!])}
                  >
                    {selected.length === 2
                      ? t("agentDashboard.compareSelected", { count: selected.length })
                      : t("agentDashboard.selectToCompare")}
                  </Button>
                </div>

                <div style={s.tableCard}>
                  <div style={s.theadRow}>
                    <span />
                    <span>{t("agentDashboard.colRanAt")}</span>
                    <span>{t("agentDashboard.colVersion")}</span>
                    <span>{t("agentDashboard.colRecall")}</span>
                    <span>{t("agentDashboard.colPrecision")}</span>
                    <span>{t("agentDashboard.colCitation")}</span>
                    <span>{t("agentDashboard.colPass")}</span>
                    <span>{t("agentDashboard.colCost")}</span>
                  </div>
                  {(runsQ.data ?? []).map((run, i, arr) => (
                    <div key={run.group_id} style={{ ...s.row, ...(i === arr.length - 1 ? s.rowLast : {}) }}>
                      <Checkbox
                        checked={selected.includes(run.group_id)}
                        onChange={() => toggleRun(run.group_id)}
                      />
                      <span style={s.metric}>{new Date(run.ran_at).toLocaleString()}</span>
                      <span style={s.metric}>v{run.agent_version}</span>
                      <span style={s.metric}>{pct(run.recall)}</span>
                      <span style={s.metric}>{pct(run.precision)}</span>
                      <span style={s.metric}>{pct(run.citation_accuracy)}</span>
                      <span style={s.metric}>
                        {run.traces_passed}/{run.traces_total}
                      </span>
                      <span style={s.metric}>{formatCostCompact(run.cost_usd)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {comparing && (
        <CompareModal groupA={comparing[0]} groupB={comparing[1]} onClose={() => setComparing(null)} />
      )}
    </div>
  );
}
