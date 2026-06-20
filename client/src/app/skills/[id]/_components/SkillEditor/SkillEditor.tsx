/* SkillEditor — edit a skill's name / description (its directive "interface") /
   type / markdown body, toggle enabled, or delete it. Saving a changed body
   creates a new immutable version. */
"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Button,
  FormField,
  TextInput,
  SelectInput,
  Textarea,
  Toggle,
  ErrorState,
  Skeleton,
  Icon,
} from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { useSkill, useUpdateSkill, useDeleteSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { SKILL_TYPE_OPTIONS } from "@/lib/skill-type";
import { ApiError } from "@/lib/api";
import { s } from "./styles";

export function SkillEditor() {
  const t = useTranslations("skills");
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { id } = params;
  const toast = useToast();

  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);
  const update = useUpdateSkill();
  const del = useDeleteSkill();

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>("custom");
  const [body, setBody] = React.useState("");
  const [enabled, setEnabled] = React.useState(true);

  React.useEffect(() => {
    if (!skill) return;
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
    setBody(skill.body);
    setEnabled(skill.enabled);
  }, [skill?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    { label: skill?.name ?? t("detail.crumbSkill") },
  ];

  if (isError || (!isLoading && !skill)) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={t("detail.notFound.title")}
          body={error instanceof ApiError ? error.message : t("detail.loadError")}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  const save = () =>
    update.mutate(
      { id, patch: { name, description, type, body, enabled } },
      { onSuccess: (data) => toast.success(t("editor.savedToast", { version: data.version })) },
    );

  const remove = () => {
    if (!skill) return;
    if (window.confirm(t("card.deleteConfirm", { name: skill.name }))) {
      del.mutate(skill.id, { onSuccess: () => router.push("/skills") });
    }
  };

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        {isLoading || !skill ? (
          <div style={s.loading}>
            <Skeleton height={24} width={240} />
            <Skeleton height={260} />
          </div>
        ) : (
          <div style={s.form}>
            <div style={s.header}>
              <button onClick={() => router.push("/skills")} style={s.back}>
                {t("detail.back")}
              </button>
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
        )}
      </div>
    </AppShell>
  );
}
