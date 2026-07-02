/* /project-context — Project Context screen (SPEC-02 T7). Read + attach-only
   browse of every specs|docs|insights markdown doc discovered in the active
   repo's clone, each shown with its badge, repo-relative path, a "Used by N
   agents" count, and a coverage % across the workspace's agents (AC-2, AC-21).
   Empty state when nothing is discovered (AC-3). Attach/detach + reorder live
   on the Agent/Skill Context editors (T8/T9), not here — this screen is
   browse-only. */
"use client";

import { useTranslations } from "next-intl";
import { Badge, EmptyState, ErrorState, ProgressBar, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useActiveRepo } from "@/lib/repo-context";
import { useProjectContextDocs } from "@/lib/hooks/projectContext";
import { badgeColor } from "./helpers";
import { s } from "./styles";

export function ProjectContextView() {
  const t = useTranslations("projectContext");
  const { repoId, activeRepo, reposLoaded } = useActiveRepo();
  const { data: docs, isLoading, isError, refetch } = useProjectContextDocs(repoId);

  const repoName = activeRepo?.full_name ?? t("page.repoFallback");
  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbTitle") }];
  const list = docs ?? [];

  if (reposLoaded && !repoId) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.page}>
          <EmptyState icon="Database" title={t("page.noRepo.title")} body={t("page.noRepo.body")} />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>
              {t("page.headingPrefix")}
              <span style={s.repo}>{repoName}</span>
            </h1>
            <p style={s.subtitle}>
              {list.length > 0 ? t("page.docCount", { count: list.length }) : t("page.subtitle")}
            </p>
          </div>
        </div>

        {isLoading && (
          <div style={s.rows}>
            <Skeleton height={56} />
            <Skeleton height={56} />
            <Skeleton height={56} />
          </div>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}

        {!isLoading && !isError && list.length === 0 && (
          <EmptyState icon="FileText" title={t("page.empty.title")} body={t("page.empty.body")} />
        )}

        {!isLoading && !isError && list.length > 0 && (
          <div style={s.rows} role="list">
            {list.map((doc) => (
              <div key={doc.path} role="listitem" style={s.row}>
                <Badge color={badgeColor(doc.badge)}>{t(`badge.${doc.badge}`)}</Badge>
                <span className="mono" style={s.path} title={doc.path}>
                  {doc.path}
                </span>
                <span style={s.usedBy}>{t("row.usedBy", { count: doc.used_by })}</span>
                <div style={s.coverage}>
                  <div style={s.coverageBar}>
                    <ProgressBar value={doc.coverage * 100} />
                  </div>
                  <span className="mono tnum" style={s.coveragePct}>
                    {t("row.coverage", { pct: Math.round(doc.coverage * 100) })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
