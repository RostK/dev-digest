"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, FormField, Icon, TextInput } from "@devdigest/ui";
import type { CiTarget } from "@devdigest/shared";
import { TARGET_CARDS } from "./constants";
import { s } from "./styles";

/** Step 1/4 — pick a CI target (only GitHub Actions is functional, AC-5/AC-20)
 *  and the target repo ("owner/name"). */
export function TargetStep({
  target,
  onTargetChange,
  repo,
  onRepoChange,
}: {
  target: CiTarget;
  onTargetChange: (t: CiTarget) => void;
  repo: string;
  onRepoChange: (v: string) => void;
}) {
  const t = useTranslations("ci");

  return (
    <div style={s.body}>
      <div style={s.cardGrid}>
        {TARGET_CARDS.map((card) => {
          const I = Icon[card.icon];
          const active = target === card.target;
          return (
            <button
              key={card.target}
              type="button"
              disabled={!card.functional}
              onClick={() => card.functional && onTargetChange(card.target)}
              style={s.card(active, card.functional)}
              aria-pressed={active}
            >
              <div style={s.cardHeader}>
                <I size={16} style={{ color: active ? "var(--accent)" : "var(--text-muted)" }} />
                <span style={s.cardTitle}>{t(`exportWizard.${card.labelKey}`)}</span>
                {card.functional ? (
                  <Badge color="var(--ok)" bg="var(--bg-hover)">
                    {t("exportWizard.recommended")}
                  </Badge>
                ) : (
                  <Badge color="var(--text-muted)">{t("exportWizard.comingSoon")}</Badge>
                )}
              </div>
              <span style={s.cardDesc}>{t(`exportWizard.${card.descKey}`)}</span>
            </button>
          );
        })}
      </div>

      <FormField label={t("exportWizard.repoLabel")} hint={t("exportWizard.repoHint")} required>
        <TextInput
          value={repo}
          onChange={onRepoChange}
          placeholder={t("exportWizard.repoPlaceholder")}
          mono
        />
      </FormField>
    </div>
  );
}
