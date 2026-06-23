/* /conventions — Conventions extractor. Scan the active repo for house-rules,
   accept/reject grounded candidates, and turn the accepted ones into Skills. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useActiveRepo } from "@/lib/repo-context";
import {
  useConventions,
  useExtractConventions,
  useSetConventionAccepted,
} from "@/lib/hooks/conventions";
import { useCreateSkill } from "@/lib/hooks/skills";
import {
  buildSkillBody,
  categorySkillName,
  evidenceFiles,
  groupByCategory,
} from "@/lib/convention-skill";
import { ConventionCard } from "./_components/ConventionCard";
import { CreateSkillFromConventionsModal } from "./_components/CreateSkillFromConventionsModal";
import { s } from "./styles";

export function ConventionsView() {
  const t = useTranslations("conventions");
  const router = useRouter();
  const { repoId, activeRepo, reposLoaded } = useActiveRepo();
  const { data: conventions, isLoading, isError, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const setAccepted = useSetConventionAccepted(repoId);
  const createSkill = useCreateSkill();
  const [creating, setCreating] = React.useState(false);

  const list = conventions ?? [];
  const accepted = list.filter((c) => c.accepted);
  const repoName = activeRepo?.full_name ?? t("page.repoFallback");
  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];

  if (reposLoaded && !repoId) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.page}>
          <EmptyState icon="Database" title={t("page.noRepo.title")} body={t("page.noRepo.body")} />
        </div>
      </AppShell>
    );
  }

  const deselectAll = () => {
    for (const c of accepted) setAccepted.mutate({ id: c.id, accepted: false });
  };

  const splitByCategory = async () => {
    if (!activeRepo) return;
    for (const [category, items] of groupByCategory(accepted)) {
      const name = categorySkillName(activeRepo.full_name, category);
      await createSkill.mutateAsync({
        name,
        description: t("create.categoryDescription", { category, repo: activeRepo.full_name }),
        type: "convention",
        source: "extracted",
        body: buildSkillBody(activeRepo.full_name, items, name),
        evidence_files: evidenceFiles(items),
      });
    }
    router.push("/skills");
  };

  const busy = extract.isPending;
  const scanLabel = busy
    ? t("page.scanning")
    : list.length > 0
      ? t("page.rescan")
      : t("page.runExtraction");

  return (
    <AppShell crumb={crumb}>
      {creating && activeRepo && (
        <CreateSkillFromConventionsModal
          repoFullName={activeRepo.full_name}
          items={accepted}
          onClose={() => setCreating(false)}
        />
      )}
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>
              {t("page.headingPrefix")}
              <span style={s.repo}>{repoName}</span>
            </h1>
            <p style={s.subtitle}>
              {list.length > 0
                ? t("page.candidateCount", { count: list.length })
                : t("page.subtitle")}
            </p>
          </div>
          <Button
            kind="secondary"
            size="sm"
            icon="RefreshCw"
            onClick={() => extract.mutate()}
            disabled={busy || !repoId}
          >
            {scanLabel}
          </Button>
        </div>

        {extract.isError && <div style={s.error}>{t("page.extractionFailed")}</div>}

        {isLoading && (
          <div style={s.cards}>
            <Skeleton height={150} />
            <Skeleton height={150} />
          </div>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}

        {!isLoading && !isError && list.length === 0 && (
          <EmptyState
            icon="ListChecks"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={scanLabel}
            onCta={() => extract.mutate()}
          />
        )}

        {list.length > 0 && (
          <>
            <div style={s.toolbar}>
              <span style={s.acceptedCount}>
                {t("page.acceptedCount", { accepted: accepted.length, total: list.length })}
              </span>
              {accepted.length > 0 && (
                <button style={s.deselect} onClick={deselectAll}>
                  {t("page.deselectAll")}
                </button>
              )}
              <div style={{ flex: 1 }} />
              {accepted.length === 0 ? (
                <Button kind="primary" size="sm" icon="Sparkles" disabled>
                  {t("page.createSkill")}
                </Button>
              ) : (
                <Dropdown
                  width={280}
                  align="right"
                  trigger={
                    <Button kind="primary" size="sm" icon="Sparkles" iconRight="ChevronDown">
                      {t("page.createSkill")}
                    </Button>
                  }
                  items={[
                    {
                      label: t("page.createSkillMenu.merge"),
                      icon: "Sparkles",
                      onClick: () => setCreating(true),
                    },
                    {
                      label: t("page.createSkillMenu.split"),
                      icon: "ListChecks",
                      onClick: () => void splitByCategory(),
                    },
                  ]}
                />
              )}
            </div>
            <div style={s.cards}>
              {list.map((c) => (
                <ConventionCard
                  key={c.id}
                  convention={c}
                  repoFullName={activeRepo?.full_name ?? ""}
                  defaultBranch={activeRepo?.default_branch ?? "main"}
                  onAccept={(a) => setAccepted.mutate({ id: c.id, accepted: a })}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
