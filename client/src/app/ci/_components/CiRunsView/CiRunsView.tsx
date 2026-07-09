"use client";

/* CI Runs page (AC-18) — every ingested CI run (`ci_runs` ⋈ `ci_installations`),
   workspace-scoped server-side. One table: repo, target type, status,
   relative run time, findings, and a link to the GitHub run/PR. */

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useCiRuns } from "@/lib/hooks/ci";
import { relativeTime } from "@/lib/relative-time";
import { ciRunStatusLabel } from "@/lib/ci-run-status";
import { s } from "./styles";

export function CiRunsView() {
  const t = useTranslations("ci");
  const { data: runs, isLoading, isError, refetch, isFetching } = useCiRuns();
  const crumb = [{ label: t("page.crumb") }];

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.header}>
          <h1 style={s.h1}>{t("runs.title")}</h1>
          <Button kind="secondary" size="sm" icon="RefreshCw" loading={isFetching} onClick={() => refetch()}>
            {isFetching ? t("runs.refreshing") : t("runs.refresh")}
          </Button>
        </div>
        <p style={s.subtitle}>{t("runs.subtitle")}</p>

        {isLoading && <Skeleton height={220} />}
        {isError && <ErrorState body={t("runs.emptyBody")} onRetry={() => refetch()} />}

        {!isLoading && !isError && (!runs || runs.length === 0) && (
          <EmptyState icon="Workflow" title={t("runs.emptyTitle")} body={t("runs.emptyBody")} />
        )}

        {!isLoading && !isError && runs && runs.length > 0 && (
          <div style={s.table}>
            <div style={s.headRow}>
              <span>{t("runs.table.repo")}</span>
              <span>{t("runs.table.target")}</span>
              <span>{t("runs.table.status")}</span>
              <span>{t("runs.table.timestamp")}</span>
              <span>{t("runs.table.findings")}</span>
              <span>{t("runs.table.link")}</span>
            </div>
            {runs.map((run) => (
              <div key={run.id} style={s.row}>
                <span style={s.repoCell}>
                  <Icon.GitBranch size={13} style={{ color: "var(--text-muted)" }} />
                  {run.repo ?? <span style={s.muted}>—</span>}
                </span>
                <span>{run.target_type ? <Badge color="var(--text-secondary)">{run.target_type}</Badge> : "—"}</span>
                <span>{ciRunStatusLabel(run.status, t)}</span>
                <span style={s.muted}>{relativeTime(run.ran_at)}</span>
                <span>{run.findings_count ?? "—"}</span>
                <span>
                  {run.github_url ? (
                    <a
                      className="mono"
                      href={run.github_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--accent-text)" }}
                    >
                      {t("runs.view")}
                    </a>
                  ) : (
                    <span style={s.muted}>—</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
