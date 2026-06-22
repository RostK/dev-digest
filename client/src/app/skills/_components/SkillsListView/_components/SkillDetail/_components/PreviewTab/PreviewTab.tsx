/* PreviewTab — read-only look at a skill's body, rendered as raw monospace text
   (never executed as Markdown/HTML) — the same security stance as the old
   SkillPreview modal, now an in-panel tab. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { s } from "./styles";

export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return (
    <div style={s.wrap}>
      <h2 style={s.heading}>{t("detail.preview.heading")}</h2>
      <p style={s.note}>
        <Icon.Lock size={12} /> {t("detail.preview.note")}
      </p>
      {skill.description && <p style={s.description}>{skill.description}</p>}
      <pre style={s.bodyText}>{skill.body}</pre>
    </div>
  );
}
