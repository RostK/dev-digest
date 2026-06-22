/* VersionsTab — immutable body-history snapshots (newest first) from
   GET /skills/:id/versions. The row matching the skill's current version is
   flagged. Bodies render as raw monospace, like the Preview tab. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Skeleton } from "@devdigest/ui";
import { useSkillVersions } from "@/lib/hooks/skills";
import { s } from "./styles";

export function VersionsTab({ skillId, currentVersion }: { skillId: string; currentVersion: number }) {
  const t = useTranslations("skills");
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skillId);

  if (isError) return <ErrorState body={t("detail.versions.loadError")} onRetry={() => refetch()} />;
  if (isLoading || !versions) {
    return (
      <div style={s.list}>
        <Skeleton height={64} />
        <Skeleton height={64} />
      </div>
    );
  }
  if (versions.length === 0) return <p style={s.empty}>{t("detail.versions.empty")}</p>;

  return (
    <div style={s.wrap}>
      <h2 style={s.heading}>{t("detail.versions.heading")}</h2>
      <div style={s.list}>
        {versions.map((v) => (
          <div key={v.version} style={s.row}>
            <div style={s.rowHead}>
              <Badge color="var(--text-secondary)">
                {t("detail.versions.version", { version: v.version })}
              </Badge>
              {v.version === currentVersion && (
                <Badge color="var(--ok)">{t("detail.versions.current")}</Badge>
              )}
              <span style={s.date}>{new Date(v.created_at).toLocaleString()}</span>
            </div>
            <pre style={s.body}>{v.body}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
