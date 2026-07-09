"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Skeleton } from "@devdigest/ui";
import type { CiFile } from "@devdigest/shared";
import { s } from "./styles";

/** Step 2/4 — the generated bundle. Only the workflow file is rendered
 *  editable; every other file is read-only (AC-4). The workflow textarea is a
 *  CONTROLLED input: edits are lifted to the wizard (`workflowOverride`) and,
 *  if non-null, committed verbatim at Install (honoring the hand-edit). There
 *  is still no live regeneration / re-validation before commit (spec Non-goals). */
export function PreviewStep({
  files,
  loading,
  error,
  workflowOverride,
  onWorkflowChange,
}: {
  files: CiFile[] | null;
  loading: boolean;
  error: string | null;
  /** The user's edited workflow YAML, or null before they've touched it (falls
   *  back to the generated `file.contents`). */
  workflowOverride: string | null;
  onWorkflowChange: (value: string) => void;
}) {
  const t = useTranslations("ci");

  if (loading) {
    return (
      <div style={s.body}>
        <p style={s.hint}>{t("exportWizard.generating")}</p>
        <Skeleton height={44} />
        <Skeleton height={44} />
        <Skeleton height={120} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={s.body}>
        <div style={s.errorBox}>{error}</div>
      </div>
    );
  }

  if (!files) return null;

  return (
    <div style={s.body}>
      <div style={s.h3}>{t("exportWizard.filesToCreate")}</div>
      <div style={s.fileList}>
        {files.map((file) => (
          <div key={file.path} style={s.fileRow}>
            <div style={s.fileHeader}>
              <span style={s.filePath}>{file.path}</span>
              {file.editable && <Badge color="var(--accent)">{t("exportWizard.editable")}</Badge>}
            </div>
            {file.editable ? (
              <textarea
                style={s.editableTextarea}
                value={workflowOverride ?? file.contents}
                onChange={(e) => onWorkflowChange(e.target.value)}
                spellCheck={false}
                aria-label={file.path}
              />
            ) : (
              <pre style={s.fileBody}>{file.contents || " "}</pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
