/* SkillDetail — right panel of the Skills Lab. Header (name + type/version
   badges) + the 4 detail tabs. Fetches the full skill itself so it stays
   self-contained; the list passes only the selected id + active tab. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs, Badge, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import { useSkill } from "@/lib/hooks/skills";
import { skillTypeColor } from "@/lib/skill-type";
import { ApiError } from "@/lib/api";
import { TABS } from "../../constants";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { StatsTab } from "./_components/StatsTab";
import { VersionsTab } from "./_components/VersionsTab";
import { s } from "./styles";

export function SkillDetail({
  skillId,
  tab,
  onTab,
}: {
  skillId: string;
  tab: string;
  onTab: (t: string) => void;
}) {
  const t = useTranslations("skills");
  const { data: skill, isLoading, isError, error, refetch } = useSkill(skillId);
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));

  if (isError || (!isLoading && !skill)) {
    return (
      <ErrorState
        title={t("detail.notFound.title")}
        body={error instanceof ApiError ? error.message : t("detail.loadError")}
        onRetry={() => refetch()}
      />
    );
  }

  if (isLoading || !skill) {
    return (
      <div style={s.loading}>
        <Skeleton height={24} width={240} />
        <Skeleton height={260} />
      </div>
    );
  }

  return (
    <>
      <div style={s.head}>
        <Icon.Sparkles size={18} style={s.headIcon} />
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        <Badge color={skillTypeColor(skill.type)}>{t(`listItem.type.${skill.type}`)}</Badge>
        <Badge color="var(--text-muted)">{t("detail.versions.version", { version: skill.version })}</Badge>
        {!skill.enabled && <Badge color="var(--text-muted)">{t("detail.disabled")}</Badge>}
      </div>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>
        {tab === "config" && <ConfigTab skill={skill} />}
        {tab === "preview" && <PreviewTab skill={skill} />}
        {tab === "stats" && <StatsTab />}
        {tab === "versions" && <VersionsTab skillId={skill.id} currentVersion={skill.version} />}
      </div>
    </>
  );
}
