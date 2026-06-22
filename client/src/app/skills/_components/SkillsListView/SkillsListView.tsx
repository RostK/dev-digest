/* Skills Lab — master-detail shell. Left: searchable skill list + Create/Import.
   Right: the selected skill's 4-tab detail (Config / Preview / Stats / Versions),
   or an empty prompt. Rendered by both /skills (no selection) and
   /skills/:id?tab= (deep-linked) — selection + tab live in the URL.
   Skills are global (not repo-scoped) — one flat list. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useSkills, useUpdateSkill } from "@/lib/hooks/skills";
import { SkillCard } from "../SkillCard";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import { ImportSkillModal } from "./_components/ImportSkillModal";
import { SkillDetail } from "./_components/SkillDetail";
import { VALID_TABS } from "./constants";
import { filterSkills } from "./helpers";
import { s } from "./styles";

export function SkillsListView({ selectedId, tab: tabProp }: { selectedId?: string | null; tab?: string } = {}) {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const [creating, setCreating] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const list = filterSkills(skills ?? [], search);
  const selected = selectedId ? skills?.find((sk) => sk.id === selectedId) : undefined;
  const tab = VALID_TABS.includes(tabProp ?? "") ? tabProp! : "config";

  const openSkill = (id: string) => router.push(`/skills/${id}?tab=${tab}`);
  const setTab = (next: string) => router.replace(`/skills/${selectedId}?tab=${next}`);

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    ...(selectedId ? [{ label: selected?.name ?? t("detail.crumbSkill") }] : []),
  ];

  return (
    <AppShell crumb={crumb}>
      {creating && <CreateSkillModal onClose={() => setCreating(false)} />}
      {importing && <ImportSkillModal onClose={() => setImporting(false)} />}
      <div style={s.wrap}>
        {/* left: skills list */}
        <div style={s.left}>
          <div style={s.leftHead}>
            <div style={s.titleRow}>
              <h1 style={s.h1}>{t("page.heading")}</h1>
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
            <div style={s.search}>
              <Icon.Search size={13} style={s.searchIcon} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("page.searchPlaceholder")}
                style={s.searchInput}
              />
            </div>
          </div>

          <div style={s.listScroll}>
            {isLoading && (
              <div style={s.listSkeletons}>
                <Skeleton height={92} />
                <Skeleton height={92} />
                <Skeleton height={92} />
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
            {list.map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                active={sk.id === selectedId}
                onClick={() => openSkill(sk.id)}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
              />
            ))}
          </div>
        </div>

        {/* right: detail */}
        <div style={s.right}>
          {selectedId ? (
            <SkillDetail skillId={selectedId} tab={tab} onTab={setTab} />
          ) : (
            <EmptyState
              icon="Sparkles"
              title={t("detail.selectTitle")}
              body={t("detail.selectBody")}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}
