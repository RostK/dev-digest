"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, FormField, SelectInput } from "@devdigest/ui";
import type { CiExportInput } from "@devdigest/shared";
import { TRIGGER_OPTIONS, type CiTrigger } from "./constants";
import { s } from "./styles";

type PostAs = CiExportInput["post_as"];
/** [value, i18n key suffix under `exportWizard.postAs.*`] — the contract uses
 *  snake_case, the message keys use camelCase. */
const POST_AS_VALUES: readonly [PostAs, string][] = [
  ["github_review", "githubReview"],
  ["pr_comment", "prComment"],
  ["none", "none"],
];

/** Step 3/4 — triggers, "Secrets expected" (NEVER reads/writes/verifies repo
 *  Secrets — AC-11), and "Post results as" + the branch-protection hint
 *  (AC-10). */
export function ConfigureStep({
  triggers,
  onToggleTrigger,
  postAs,
  onPostAsChange,
}: {
  triggers: CiTrigger[];
  onToggleTrigger: (trigger: CiTrigger) => void;
  postAs: PostAs;
  onPostAsChange: (v: PostAs) => void;
}) {
  const t = useTranslations("ci");
  const postAsOptions = POST_AS_VALUES.map(([value, msgKey]) => ({
    value,
    label: t(`exportWizard.postAs.${msgKey}`),
  }));

  return (
    <div style={s.body}>
      <div style={s.section}>
        <div style={s.h3}>{t("exportWizard.triggerLabel")}</div>
        <div style={s.triggerRow}>
          {TRIGGER_OPTIONS.map((trigger) => (
            <Checkbox
              key={trigger}
              checked={triggers.includes(trigger)}
              onChange={() => onToggleTrigger(trigger)}
              label={t(`exportWizard.triggers.${trigger}`)}
            />
          ))}
        </div>
      </div>

      <div style={s.section}>
        <div style={s.h3}>{t("exportWizard.secretsExpectedTitle")}</div>
        <div style={s.secretsPanel}>
          <div style={s.secretRow}>
            <span className="mono">OPENROUTER_API_KEY</span>
            <Badge color="var(--warn)">{t("exportWizard.secretStatus.notSet")}</Badge>
          </div>
          <div style={s.secretRow}>
            <span className="mono">GITHUB_TOKEN</span>
            <Badge color="var(--ok)">{t("exportWizard.secretStatus.ready")}</Badge>
          </div>
        </div>
      </div>

      <FormField label={t("exportWizard.postResultsLabel")}>
        <SelectInput value={postAs} onChange={(v) => onPostAsChange(v as PostAs)} options={postAsOptions} mono={false} />
      </FormField>

      <div style={s.section}>
        <div style={s.h3}>{t("exportWizard.blockMergeTitle")}</div>
        <p style={s.hint}>{t("exportWizard.blockMergeDesc")}</p>
      </div>
    </div>
  );
}
