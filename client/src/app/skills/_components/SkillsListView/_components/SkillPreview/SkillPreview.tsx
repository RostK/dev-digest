/* SkillPreview — read-only look at a skill's body (rendered as monospace data,
   never executed as markdown/HTML) + its enable toggle + an Edit shortcut. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal, Badge, Toggle } from "@devdigest/ui";
import { useSkill, useUpdateSkill } from "@/lib/hooks/skills";
import { skillTypeColor } from "@/lib/skill-type";
import { s } from "./styles";

export function SkillPreview({
  skillId,
  onClose,
  onEdit,
}: {
  skillId: string;
  onClose: () => void;
  onEdit: () => void;
}) {
  const t = useTranslations("skills");
  const { data: skill, isLoading } = useSkill(skillId);
  const update = useUpdateSkill();

  return (
    <Modal
      width={680}
      title={skill?.name ?? t("preview.loading")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          {skill && (
            <label style={s.enabledLabel}>
              {skill.enabled ? t("preview.enabled") : t("preview.disabled")}
              <Toggle
                on={skill.enabled}
                onChange={(enabled) => update.mutate({ id: skill.id, patch: { enabled } })}
                size={16}
              />
            </label>
          )}
          <Button kind="ghost" onClick={onClose}>
            {t("preview.close")}
          </Button>
          <Button kind="primary" icon="Edit" onClick={onEdit}>
            {t("preview.edit")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        {isLoading || !skill ? (
          <p style={s.muted}>{t("preview.loading")}</p>
        ) : (
          <>
            <div style={s.metaRow}>
              <Badge color={skillTypeColor(skill.type)}>{t(`listItem.type.${skill.type}`)}</Badge>
              <Badge color="var(--text-muted)">{t("preview.version", { version: skill.version })}</Badge>
            </div>
            {skill.description && <p style={s.description}>{skill.description}</p>}
            <pre style={s.bodyText}>{skill.body}</pre>
          </>
        )}
      </div>
    </Modal>
  );
}
