/* CreateSkillFromConventionsModal — merge the accepted candidates into one Skill.
   Name / description / type / enabled / markdown body are pre-filled and editable;
   on save it creates a GLOBAL `extracted` convention skill via the existing
   /skills API (skills are not repo-scoped — no repo_id pin). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Modal, FormField, TextInput, SelectInput, Textarea, Toggle } from "@devdigest/ui";
import type { ConventionCandidate, SkillType } from "@devdigest/shared";
import { useCreateSkill } from "@/lib/hooks/skills";
import { SKILL_TYPE_OPTIONS } from "@/lib/skill-type";
import { buildSkillBody, defaultSkillName, evidenceFiles } from "@/lib/convention-skill";
import { DEFAULT_SKILL_TYPE, MODAL_WIDTH } from "./constants";
import { s } from "./styles";

export function CreateSkillFromConventionsModal({
  repoFullName,
  items,
  onClose,
}: {
  repoFullName: string;
  items: ConventionCandidate[];
  onClose: () => void;
}) {
  const t = useTranslations("conventions");
  const router = useRouter();
  const create = useCreateSkill();
  const [name, setName] = React.useState(() => defaultSkillName(repoFullName));
  const [description, setDescription] = React.useState(() =>
    t("create.defaultDescription", { repo: repoFullName }),
  );
  const [type, setType] = React.useState<SkillType>(DEFAULT_SKILL_TYPE);
  const [enabled, setEnabled] = React.useState(true);
  const [body, setBody] = React.useState(() =>
    buildSkillBody(repoFullName, items, defaultSkillName(repoFullName)),
  );

  const submit = async () => {
    const finalName = name.trim() || defaultSkillName(repoFullName);
    const skill = await create.mutateAsync({
      name: finalName,
      description,
      type,
      source: "extracted",
      enabled,
      body: body.trim() || buildSkillBody(repoFullName, items, finalName),
      evidence_files: evidenceFiles(items),
    });
    onClose();
    router.push(`/skills/${skill.id}`);
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("create.title")}
      subtitle={name}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <span style={s.savedHint}>{t("create.savedHint")}</span>
          <div style={{ flex: 1 }} />
          <Button kind="ghost" onClick={onClose}>
            {t("create.cancel")}
          </Button>
          <Button kind="primary" icon="Sparkles" onClick={submit} disabled={create.isPending}>
            {create.isPending ? t("create.creating") : t("create.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.merged}>{t("create.merged", { count: items.length, repo: repoFullName })}</div>
        <FormField label={t("create.fields.name")} required>
          <TextInput value={name} onChange={setName} mono />
        </FormField>
        <FormField label={t("create.fields.description")}>
          <TextInput value={description} onChange={setDescription} />
        </FormField>
        <div style={s.row}>
          <FormField label={t("create.fields.type")}>
            <SelectInput
              value={type}
              onChange={(v) => setType(v as SkillType)}
              options={[...SKILL_TYPE_OPTIONS]}
            />
          </FormField>
          <FormField label={t("create.fields.enabled")} hint={t("create.fields.enabledHint")}>
            <Toggle on={enabled} onChange={setEnabled} />
          </FormField>
        </div>
        <FormField label={t("create.fields.body")} hint={t("create.fields.bodyHint")}>
          <Textarea value={body} onChange={setBody} rows={14} mono />
        </FormField>
      </div>
    </Modal>
  );
}
