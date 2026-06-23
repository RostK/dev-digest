/* Import-skill modal — upload a .md or .zip; the server extracts ONLY the body
   and returns a preview (nothing is executed). The user reviews the body +
   ignored archive entries, acknowledges the trust note, then confirms to save.
   Imported skills start disabled (source=community) until vetted. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Modal, FormField, TextInput, SelectInput, Textarea, Badge, Icon } from "@devdigest/ui";
import type { SkillImportPreview, SkillType } from "@devdigest/shared";
import { useImportSkillPreview, useCreateSkill } from "@/lib/hooks/skills";
import { SKILL_TYPE_OPTIONS } from "@/lib/skill-type";
import { ApiError } from "@/lib/api";
import { MODAL_WIDTH } from "../CreateSkillModal/constants";
import { fileToBase64 } from "./helpers";
import { s } from "./styles";

export function ImportSkillModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const preview = useImportSkillPreview();
  const create = useCreateSkill();

  const [data, setData] = React.useState<SkillImportPreview | null>(null);
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<SkillType>("custom");
  const [body, setBody] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const onFile = async (file: File) => {
    setError(null);
    try {
      const content_base64 = await fileToBase64(file);
      const result = await preview.mutateAsync({ filename: file.name, content_base64 });
      setData(result);
      setName(result.name);
      setBody(result.body);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("import.failed"));
    }
  };

  const confirm = async () => {
    if (!data) return;
    const skill = await create.mutateAsync({
      name: name.trim() || data.name,
      type,
      source: "community",
      body,
      enabled: false,
    });
    onClose();
    router.push(`/skills/${skill.id}`);
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("import.title")}
      subtitle={t("import.subtitle")}
      onClose={onClose}
      footer={
        data ? (
          <div style={s.footer}>
            <Button kind="ghost" onClick={() => setData(null)}>
              {t("import.back")}
            </Button>
            <Button kind="primary" icon="Check" onClick={confirm} disabled={create.isPending}>
              {create.isPending ? t("import.saving") : t("import.confirm")}
            </Button>
          </div>
        ) : null
      }
    >
      <div style={s.body}>
        <div style={s.trust}>
          <Icon.AlertTriangle size={15} style={{ color: "var(--warn)", flexShrink: 0, marginTop: 1 }} />
          <span>{t("import.trust")}</span>
        </div>

        {!data ? (
          <>
            <FormField label={t("import.fileLabel")} hint={t("import.fileHint")}>
              <input
                type="file"
                accept=".md,.markdown,.txt,.zip"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
                style={s.fileInput}
              />
            </FormField>
            {preview.isPending && <p style={s.muted}>{t("import.parsing")}</p>}
            {error && <p style={s.error}>{error}</p>}
          </>
        ) : (
          <>
            <FormField label={t("import.nameLabel")} required>
              <TextInput value={name} onChange={setName} mono />
            </FormField>
            <FormField label={t("import.typeLabel")}>
              <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={[...SKILL_TYPE_OPTIONS]} />
            </FormField>
            {data.warnings.map((w, i) => (
              <div key={i} style={s.warn}>
                <Icon.Shield size={13} /> <span>{w}</span>
              </div>
            ))}
            {data.ignored_files.length > 0 && (
              <FormField label={t("import.ignoredLabel")}>
                <div style={s.ignored}>
                  {data.ignored_files.map((f) => (
                    <Badge key={f} color="var(--text-muted)">
                      {f}
                    </Badge>
                  ))}
                </div>
              </FormField>
            )}
            <FormField label={t("import.bodyLabel")} hint={t("import.bodyHint")}>
              <Textarea value={body} onChange={setBody} rows={10} mono />
            </FormField>
          </>
        )}
      </div>
    </Modal>
  );
}
