"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { CiExport } from "@devdigest/shared";
import { s } from "./styles";

/** Step 4/4 — "Open a PR" (AC-13) or "Copy files as a zip" (AC-14). Both call
 *  `useCiInstall` with a different `action`; the parent tracks which one is
 *  in flight so only that button shows the pending state. */
export function InstallStep({
  repo,
  filesCount,
  onInstall,
  pendingAction,
  result,
  error,
}: {
  repo: string;
  filesCount: number;
  onInstall: (action: "open_pr" | "files") => void;
  pendingAction: "open_pr" | "files" | null;
  result: CiExport | null;
  error: string | null;
}) {
  const t = useTranslations("ci");
  const [copiedPath, setCopiedPath] = React.useState<string | null>(null);

  const copy = async (path: string, contents: string) => {
    try {
      await navigator.clipboard.writeText(contents);
      setCopiedPath(path);
    } catch {
      /* clipboard unavailable — no-op, the file is still visible to select/copy manually */
    }
  };

  return (
    <div style={s.body}>
      <div style={s.installCard}>
        <div style={s.h3}>{t("exportWizard.installCardTitle")}</div>
        <p style={s.hint}>{t("exportWizard.installCardBody", { repo: repo || t("exportWizard.ownerRepo"), count: filesCount })}</p>
        <div style={s.installActions}>
          <Button
            kind="primary"
            icon="GitPullRequest"
            onClick={() => onInstall("open_pr")}
            disabled={pendingAction !== null}
            loading={pendingAction === "open_pr"}
          >
            {pendingAction === "open_pr" ? t("exportWizard.installing") : t("exportWizard.openPr")}
          </Button>
          <Button
            kind="secondary"
            icon="Copy"
            onClick={() => onInstall("files")}
            disabled={pendingAction !== null}
            loading={pendingAction === "files"}
          >
            {pendingAction === "files" ? t("exportWizard.installing") : t("exportWizard.copyZip")}
          </Button>
        </div>
        <p style={s.hint}>{t("exportWizard.secretNote", { key: "OPENROUTER_API_KEY" })}</p>
      </div>

      {error && <div style={s.errorBox}>{error}</div>}

      {result && result.pr_url && (
        <div style={s.resultBox}>
          <span>{t("exportWizard.prOpened")}</span>
          <a
            className="mono"
            href={result.pr_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--accent-text)" }}
          >
            {t("exportWizard.viewPr")}
          </a>
        </div>
      )}

      {result && !result.pr_url && result.files.length > 0 && (
        <div style={s.resultBox}>
          <span>{t("exportWizard.filesReturnedTitle")}</span>
          {result.files.map((f) => (
            <div key={f.path} style={s.resultFileRow}>
              <span style={{ flex: 1 }}>{f.path}</span>
              <Button kind="ghost" size="sm" icon="Copy" onClick={() => void copy(f.path, f.contents)}>
                {copiedPath === f.path ? t("exportWizard.copied") : t("exportWizard.copy")}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
