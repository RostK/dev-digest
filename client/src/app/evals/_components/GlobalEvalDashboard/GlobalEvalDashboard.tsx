/* GlobalEvalDashboard — the /evals landing page (A4, L06). Read-only,
   workspace-wide view: a per-agent summary rollup (recall/precision/citation
   + run count, linking into that agent's dashboard) and a list of the most
   recent eval runs across every agent. Data comes from
   `useGlobalEvalDashboard()` — no fetch in this component. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon, Skeleton, ErrorState, EmptyState, SectionLabel } from "@devdigest/ui";
import { useGlobalEvalDashboard } from "@/lib/hooks/evals";
import { formatCostCompact } from "@/components/RunCostBadge";
import { s } from "./styles";

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function GlobalEvalDashboard() {
  const t = useTranslations("evals");
  const { data, isLoading, isError, refetch } = useGlobalEvalDashboard();

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.title}>
          <Icon.Gauge size={20} style={{ color: "var(--accent)" }} />
          {t("global.title")}
        </div>
        <div style={s.subtitle}>{t("global.subtitle")}</div>
      </div>

      <Body data={data} isLoading={isLoading} isError={isError} refetch={refetch} t={t} />
    </div>
  );
}

function Body({
  data,
  isLoading,
  isError,
  refetch,
  t,
}: {
  data: ReturnType<typeof useGlobalEvalDashboard>["data"];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  if (isLoading) {
    return (
      <div style={s.loading}>
        <Skeleton height={140} />
        <Skeleton height={200} />
      </div>
    );
  }

  if (isError || !data) {
    return <ErrorState fullScreen title={t("global.error")} onRetry={() => refetch()} />;
  }

  const { summary_rows, recent_runs } = data;

  if (summary_rows.length === 0 && recent_runs.length === 0) {
    return <EmptyState icon="Gauge" title={t("global.empty.title")} body={t("global.empty.body")} />;
  }

  return (
    <>
      <div style={s.section}>
        <SectionLabel icon="Cpu">{t("global.summaryHeading")}</SectionLabel>
        <div style={s.card}>
          <div style={s.theadRow}>
            <span>{t("global.colAgent")}</span>
            <span>{t("global.colVersion")}</span>
            <span>{t("global.colRecall")}</span>
            <span>{t("global.colPrecision")}</span>
            <span>{t("global.colCitation")}</span>
            <span>{t("global.colRuns")}</span>
            <span />
          </div>
          {summary_rows.map((row, i) => (
            <Link
              key={row.agent_id}
              href={`/evals/${row.agent_id}`}
              style={{
                ...s.row,
                ...(i === summary_rows.length - 1 ? s.rowLast : {}),
              }}
            >
              <span style={s.agentName}>{row.agent_name}</span>
              <span style={s.metric}>v{row.agent_version}</span>
              <span style={s.metric}>{pct(row.recall)}</span>
              <span style={s.metric}>{pct(row.precision)}</span>
              <span style={s.metric}>{pct(row.citation_accuracy)}</span>
              <span style={s.metric}>{row.run_count}</span>
              <Icon.ChevronRight size={14} style={{ color: "var(--text-muted)" }} />
            </Link>
          ))}
        </div>
      </div>

      <div style={s.section}>
        <SectionLabel icon="History">{t("global.recentRunsHeading")}</SectionLabel>
        <div style={s.card}>
          <div style={s.runsTheadRow}>
            <span>{t("global.colRanAt")}</span>
            <span>{t("global.colVersion")}</span>
            <span>{t("global.colRecall")}</span>
            <span>{t("global.colPrecision")}</span>
            <span>{t("global.colCitation")}</span>
            <span>{t("global.colCost")}</span>
          </div>
          {recent_runs.map((run) => (
            <div key={run.group_id} style={s.runsRow}>
              <span style={s.metric}>{new Date(run.ran_at).toLocaleString()}</span>
              <span style={s.metric}>v{run.agent_version}</span>
              <span style={s.metric}>{pct(run.recall)}</span>
              <span style={s.metric}>{pct(run.precision)}</span>
              <span style={s.metric}>{pct(run.citation_accuracy)}</span>
              <span style={s.metric}>{formatCostCompact(run.cost_usd)}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
