/* ConfigTab — edit a skill's name / description (its directive "interface") /
   type / markdown body, toggle enabled, or delete it. Saving a changed body
   creates a new immutable version. (Ported from the standalone SkillEditor.) */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, FormField, TextInput, SelectInput, Textarea, Toggle, Icon } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useUpdateSkill, useDeleteSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { SKILL_TYPE_OPTIONS } from "@/lib/skill-type";
import { s } from "./styles";

export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const update = useUpdateSkill();
  const del = useDeleteSkill();

  const [name, setName] = React.useState(skill.name);
  const [description, setDescription] = React.useState(skill.description);
  const [type, setType] = React.useState<SkillType>(skill.type);
  const [body, setBody] = React.useState(skill.body);
  const [enabled, setEnabled] = React.useState(skill.enabled);

  // Reseed when the selected skill changes underneath us (deep-link nav).
  React.useEffect(() => {
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
    setBody(skill.body);
    setEnabled(skill.enabled);
  }, [skill.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () =>
    update.mutate(
      { id: skill.id, patch: { name, description, type, body, enabled } },
      { onSuccess: (data) => toast.success(t("editor.savedToast", { version: data.version })) },
    );

  const remove = () => {
    if (window.confirm(t("card.deleteConfirm", { name: skill.name }))) {
      del.mutate(skill.id, { onSuccess: () => router.push("/skills") });
    }
  };

  return (
    <div style={s.form}>
      <div style={s.header}>
        <label style={s.enabledLabel}>
          {t("editor.enabled")}
          <Toggle on={enabled} onChange={setEnabled} size={16} />
        </label>
      </div>
      <FormField label={t("editor.name")} required>
        <TextInput value={name} onChange={setName} mono />
      </FormField>
      <FormField label={t("editor.description")} hint={t("editor.descriptionHint")}>
        <TextInput value={description} onChange={setDescription} />
      </FormField>
      <FormField label={t("editor.type")}>
        <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={[...SKILL_TYPE_OPTIONS]} />
      </FormField>
      <FormField label={t("editor.body")} hint={t("editor.bodyHint")}>
        <Textarea value={body} onChange={setBody} rows={14} mono />
      </FormField>
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending}>
          {update.isPending ? t("editor.saving") : t("editor.save")}
        </Button>
        {update.isSuccess && (
          <span style={s.savedNote}>{t("editor.saved", { version: update.data?.version })}</span>
        )}
        <button onClick={remove} disabled={del.isPending} style={s.delete}>
          <Icon.Trash size={14} /> {t("editor.delete")}
        </button>
      </div>
    </div>
  );
}
