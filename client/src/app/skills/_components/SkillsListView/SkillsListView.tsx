/* /skills — Skills list. Reusable, user-editable skill bodies shared across
   agents. Card grid + Create/Import; clicking a card opens a preview. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useSkills, useUpdateSkill } from "@/lib/hooks/skills";
import { useActiveRepo } from "@/lib/repo-context";
import { SkillCard } from "../SkillCard";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import { ImportSkillModal } from "./_components/ImportSkillModal";
import { SkillPreview } from "./_components/SkillPreview";
import { filterSkills, filterByScope, type SkillScope } from "./helpers";
import { s } from "./styles";

export function SkillsListView() {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const [creating, setCreating] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [previewId, setPreviewId] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  // Default to the active repo: global skills + this repo's pinned skills (other
  // repos' conventions are hidden, matching the review-time scope). Switchable.
  const { repoId } = useActiveRepo();
  const [scope, setScope] = React.useState<SkillScope>("repo");

  const list = filterSkills(filterByScope(skills ?? [], scope, repoId), search);

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      {creating && <CreateSkillModal onClose={() => setCreating(false)} />}
      {importing && <ImportSkillModal onClose={() => setImporting(false)} />}
      {previewId && (
        <SkillPreview
          skillId={previewId}
          onClose={() => setPreviewId(null)}
          onEdit={() => router.push(`/skills/${previewId}`)}
        />
      )}
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("page.heading")}</h1>
            <p style={s.subtitle}>{t("page.subtitle")}</p>
          </div>
          <div style={s.search}>
            <Icon.Search size={13} style={s.searchIcon} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("page.searchPlaceholder")}
              style={s.searchInput}
            />
          </div>
          <Dropdown
            width={180}
            align="right"
            trigger={
              <Button kind="secondary" size="sm" icon="Filter" iconRight="ChevronDown">
                {t(`page.scope.${scope}`)}
              </Button>
            }
            items={[
              { label: t("page.scope.repo"), icon: "GitBranch", onClick: () => setScope("repo") },
              { label: t("page.scope.global"), icon: "Globe", onClick: () => setScope("global") },
              { label: t("page.scope.all"), icon: "Layers", onClick: () => setScope("all") },
            ]}
          />
          <Dropdown
            width={220}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                {t("page.addSkill")}
              </Button>
            }
            items={[
              { label: t("page.menu.create"), icon: "Edit", onClick: () => setCreating(true) },
              { label: t("page.menu.import"), icon: "Upload", onClick: () => setImporting(true) },
            ]}
          />
        </div>

        {isLoading && (
          <div style={s.grid}>
            <Skeleton height={120} />
            <Skeleton height={120} />
            <Skeleton height={120} />
          </div>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
        {!isLoading && !isError && list.length === 0 && (
          <EmptyState
            icon="Sparkles"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={() => setCreating(true)}
          />
        )}
        {list.length > 0 && (
          <div style={s.grid}>
            {list.map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                onClick={() => setPreviewId(sk.id)}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
