/* MultiRunHistoryList — the PR's past multi-runs, most-recent first (AC-25),
   rendered on the results page below the switcher/conflicts (T4). Each row
   opens that run's OWN results page by id; a single "Re-run" control
   restarts a NEW multi-run over the CURRENTLY-VIEWED run's agent set
   (reusing useStartMultiRun, with the same in-flight double-click guard as
   the picker/Configure-run page, AC-23). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, Skeleton } from "@devdigest/ui";
import { formatCostCompact } from "@/components/RunCostBadge";
import { useMultiRunHistory, useStartMultiRun } from "@/lib/hooks/multiAgent";
import { formatDurationLabel, formatRanAt } from "./helpers";
import { s } from "./styles";

export interface MultiRunHistoryListProps {
  prId: string;
  /** The agent ids of the run currently being viewed — reused for "Re-run". */
  agentIds: string[];
}

export function MultiRunHistoryList({ prId, agentIds }: MultiRunHistoryListProps) {
  const t = useTranslations("multiAgentReview");
  const router = useRouter();
  const { data: history, isLoading } = useMultiRunHistory(prId);
  const start = useStartMultiRun();
  const [launching, setLaunching] = React.useState(false);

  const rows = history ?? [];
  const canRerun = agentIds.length > 0 && !launching;

  const handleRerun = async () => {
    if (!canRerun) return;
    setLaunching(true);
    try {
      const res = await start.mutateAsync({ prId, agentIds });
      router.push(`/multi-agent/runs/${res.id}`);
    } finally {
      setLaunching(false);
    }
  };

  return (
    <section style={s.section}>
      <div style={s.header}>
        <h2 style={s.heading}>{t("history.title")}</h2>
        <Button
          kind="secondary"
          size="sm"
          icon="RefreshCw"
          disabled={!canRerun}
          loading={launching}
          onClick={() => void handleRerun()}
        >
          {launching ? t("history.starting") : t("history.rerun")}
        </Button>
      </div>

      {isLoading ? (
        <Skeleton height={80} />
      ) : rows.length === 0 ? (
        <EmptyState icon="History" title={t("history.emptyTitle")} body={t("history.emptyBody")} />
      ) : (
        <ul style={s.list}>
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                style={s.row}
                onClick={() => router.push(`/multi-agent/runs/${row.id}`)}
              >
                <span style={s.date}>{formatRanAt(row.ran_at)}</span>
                <span style={s.meta}>
                  {t("history.rowMeta", {
                    agents: row.agent_count,
                    duration: formatDurationLabel(row.total_duration_ms),
                    cost: formatCostCompact(row.total_cost_usd),
                  })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
