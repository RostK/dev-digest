/* OnboardingView — /repos/:repoId/onboarding (Onboarding Tour, SPEC-03).
   Reads one GET envelope (tour + freshness + latest in-flight job) and
   renders one of: not-indexed (AC-19), empty "Generate" (AC-5),
   generating (first tour, AC-23), or the five-card tour with the header's
   Regenerate/Share + updating/stale indicators (AC-9, AC-21, AC-22). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { useGenerateOnboarding, useOnboarding, useOnboardingJob } from "@/lib/hooks/onboarding";
import { Header } from "./Header";
import { TableOfContents } from "./TableOfContents";
import { SectionCard } from "./Sections";
import { isJobActive, orderedSections } from "./helpers";
import { s } from "./styles";

export function OnboardingView({ repoId }: { repoId: string }) {
  const t = useTranslations("onboarding");
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data, isLoading, isError, refetch } = useOnboarding(repoId);
  const generate = useGenerateOnboarding(repoId);

  // The just-triggered job (Generate/Regenerate) takes priority; otherwise
  // fall back to whatever in-flight job the envelope itself carries (a page
  // load mid-generation, e.g. an auto-regen kicked off by a re-index).
  const jobId = generate.data?.job_id ?? data?.job?.job_id ?? null;
  const job = useOnboardingJob(repoId, jobId);
  const jobStatus = job.data?.status ?? data?.job?.status ?? null;
  const jobActive = isJobActive(jobStatus);

  // Once the tracked job settles to "done", refresh the envelope immediately
  // (fresh tour + generated_at) instead of waiting for the next poll tick.
  const prevStatusRef = React.useRef<typeof jobStatus>(null);
  React.useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = jobStatus;
    if (prev && isJobActive(prev) && jobStatus === "done") refetch();
  }, [jobStatus, refetch]);

  const repoName = activeRepo?.full_name ?? repoId;
  const crumb = [
    { label: repoName, mono: true, href: `/repos/${repoId}/pulls` },
    { label: t("crumb") },
  ];

  const onGenerate = () => generate.mutate();

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  if (isLoading) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.page}>
          <Skeleton height={28} width={360} />
          <Skeleton height={16} width={260} />
          <Skeleton height={200} />
        </div>
      </AppShell>
    );
  }

  if (isError || !data) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={t("loadError.title")}
          body={t("loadError.body")}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  if (!data.indexed) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.page}>
          <EmptyState icon="Database" title={t("notIndexed.title")} body={t("notIndexed.body")} />
        </div>
      </AppShell>
    );
  }

  const hasTour = !!data.tour;

  if (!hasTour && jobActive) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.page}>
          <div style={s.centerState}>
            <Skeleton height={22} width={280} />
            <p style={s.centerStateText}>{t("generate.generating")}</p>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!hasTour) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.page}>
          <EmptyState
            icon="Compass"
            title={t("generate.title")}
            body={t("generate.body")}
            cta={t("generate.cta")}
            onCta={onGenerate}
            ctaLoading={generate.isPending}
          />
        </div>
      </AppShell>
    );
  }

  const sections = orderedSections(data.tour);

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <Header
          repoName={repoName}
          filesIndexed={data.files_indexed}
          generatedAt={data.generated_at}
          jobActive={jobActive}
          stale={data.stale && !jobActive}
          regenerating={generate.isPending || jobActive}
          onRegenerate={onGenerate}
        />
        <div style={s.layout}>
          <TableOfContents sections={sections} />
          <div style={s.content}>
            {sections.map(({ def, section }) => (
              <SectionCard
                key={def.kind}
                def={def}
                section={section}
                repoFullName={activeRepo?.full_name ?? null}
                defaultBranch={activeRepo?.default_branch ?? null}
              />
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
