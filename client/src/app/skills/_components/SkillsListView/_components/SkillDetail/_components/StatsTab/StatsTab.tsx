/* StatsTab — per-skill usage placeholder. There is no skill-stats endpoint yet
   (unlike agents); this slot is filled in a later lesson. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";

export function StatsTab() {
  const t = useTranslations("skills");
  return <EmptyState icon="BarChart" title={t("detail.stats.title")} body={t("detail.stats.body")} />;
}
