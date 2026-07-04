/* ConfigTab — edit a skill's name / description (its directive "interface") /
   type / markdown body, toggle enabled, or delete it. Saving a changed body
   creates a new immutable version. (Ported from the standalone SkillEditor.)
   Also owns the "Project context to use" section (SPEC-02 T9): attach/detach
   + reorder the skill's own Project Context docs via the shared
   ContextDocList (T7), with a live "SERIALIZES AS" preview of the canonical
   `## Project context` prompt header (AC-6). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, FormField, TextInput, SelectInput, Textarea, Toggle, Icon } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useUpdateSkill, useDeleteSkill } from "@/lib/hooks/skills";
import { useSkillContext, useSetSkillContext } from "@/lib/hooks/skillContext";
import { useProjectContextDocs } from "@/lib/hooks/projectContext";
import { useActiveRepo } from "@/lib/repo-context";
import { useToast } from "@/lib/toast";
import { SKILL_TYPE_OPTIONS } from "@/lib/skill-type";
import { ContextDocList, type ContextDocListItem, mergeContextDocs, move } from "@/components/ContextDocList";
import { s } from "./styles";

/** The canonical prompt header this section serializes under — a literal
 *  protocol constant matching reviewer-core's `## Project context` slot
 *  (`reviewer-core/prompt.ts`) exactly, not `## Project specifications`
 *  (AC-6). Deliberately NOT run through i18n: translating it would break the
 *  "SERIALIZES AS" preview's contract with the actual prompt assembly, which
 *  is locale-independent. */
const SERIALIZED_HEADER = "## Project context";

const cs = {
  section: { marginTop: 28, paddingTop: 20, borderTop: "1px solid var(--border)" } satisfies React.CSSProperties,
  heading: { fontSize: 14, fontWeight: 600, margin: "0 0 4px" } satisfies React.CSSProperties,
  note: { fontSize: 12, color: "var(--text-muted)", margin: "0 0 14px" } satisfies React.CSSProperties,
  preview: {
    marginTop: 14,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies React.CSSProperties,
  previewLabel: {
    fontSize: 11,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    display: "block",
    marginBottom: 6,
  } satisfies React.CSSProperties,
  previewBody: {
    margin: 0,
    fontSize: 12,
    fontFamily: "var(--font-mono, monospace)",
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
  } satisfies React.CSSProperties,
} as const;

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

  // --- Project context to use (SPEC-02 T9) ---
  const { repoId } = useActiveRepo();
  const { data: allDocs } = useProjectContextDocs(repoId);
  const { data: attachment } = useSkillContext(skill.id);
  const setContext = useSetSkillContext(skill.id);

  const [contextItems, setContextItems] = React.useState<ContextDocListItem[] | null>(null);
  const [contextSelected, setContextSelected] = React.useState<ReadonlySet<string>>(new Set());
  const [contextFilter, setContextFilter] = React.useState("");

  // (Re)build from server data — on skill switch and after each save (the
  // mutation writes the cache, so this reflects the persisted attach set).
  React.useEffect(() => {
    if (allDocs && attachment) {
      const merged = mergeContextDocs(allDocs, attachment);
      setContextItems(merged.items);
      setContextSelected(merged.selected);
    }
  }, [skill.id, allDocs, attachment]);

  const persistContext = (items: ContextDocListItem[], selected: ReadonlySet<string>) => {
    setContextItems(items);
    setContextSelected(selected);
    const paths = items.filter((it) => selected.has(it.path)).map((it) => it.path);
    setContext.mutate(paths);
  };

  const toggleContextDoc = (path: string) => {
    if (!contextItems) return;
    const next = new Set(contextSelected);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    persistContext(contextItems, next);
  };

  const reorderContextDocs = (from: number, to: number) => {
    if (!contextItems) return;
    persistContext(move(contextItems, from, to), contextSelected);
  };

  const attachedPaths = (contextItems ?? [])
    .filter((it) => contextSelected.has(it.path))
    .map((it) => it.path);
  const serializedPreview =
    attachedPaths.length > 0 ? [SERIALIZED_HEADER, ...attachedPaths].join("\n") : SERIALIZED_HEADER;

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

      <div style={cs.section}>
        <h3 style={cs.heading}>{t("context.title")}</h3>
        <p style={cs.note}>{t("context.note")}</p>
        {contextItems && (
          <ContextDocList
            items={contextItems}
            selected={contextSelected}
            onToggle={toggleContextDoc}
            onReorder={reorderContextDocs}
            filter={contextFilter}
            onFilterChange={setContextFilter}
          />
        )}
        <div style={cs.preview}>
          <span style={cs.previewLabel}>{t("context.serializesAs")}</span>
          <pre style={cs.previewBody}>{serializedPreview}</pre>
        </div>
      </div>

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
