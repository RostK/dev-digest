/* Header — title/subtitle + updating/stale indicators + Share link + the
   Regenerate action (behind a confirm modal — AC-9). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Modal } from "@devdigest/ui";
import { copyToClipboard, formatRelative } from "./helpers";
import { s } from "./styles";

export function Header({
  repoName,
  filesIndexed,
  generatedAt,
  jobActive,
  stale,
  regenerating,
  onRegenerate,
}: {
  repoName: string;
  filesIndexed: number;
  generatedAt: string | null;
  jobActive: boolean;
  stale: boolean;
  regenerating: boolean;
  onRegenerate: () => void;
}) {
  const t = useTranslations("onboarding");
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const onShare = () => {
    copyToClipboard(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const confirmRegenerate = () => {
    setConfirmOpen(false);
    onRegenerate();
  };

  return (
    <div style={s.header}>
      <div style={s.headerText}>
        <div style={s.titleRow}>
          <h1 style={s.h1}>{t("heading", { repo: repoName })}</h1>
          {jobActive && (
            <Badge dot color="var(--accent-text)" bg="var(--bg-hover)">
              {t("regenerating")}
            </Badge>
          )}
          {!jobActive && stale && (
            <Badge dot color="var(--warn)" bg="var(--warn-bg)">
              {t("stale")}
            </Badge>
          )}
        </div>
        <p style={s.subtitle}>
          {t("subtitle", { count: filesIndexed, relative: formatRelative(generatedAt) })}
        </p>
      </div>

      <div style={s.headerActions}>
        <Button kind="secondary" size="sm" icon={copied ? "Check" : "Link"} onClick={onShare}>
          {copied ? t("shareCopied") : t("share")}
        </Button>
        <Button
          kind="secondary"
          size="sm"
          icon="RefreshCw"
          loading={regenerating}
          disabled={regenerating}
          onClick={() => setConfirmOpen(true)}
        >
          {t("regenerate")}
        </Button>
      </div>

      {confirmOpen && (
        <Modal
          title={t("confirmRegenerate.title")}
          subtitle={t("confirmRegenerate.body")}
          onClose={() => setConfirmOpen(false)}
          footer={
            <div style={s.modalFooter}>
              <Button kind="ghost" onClick={() => setConfirmOpen(false)}>
                {t("confirmRegenerate.cancel")}
              </Button>
              <Button kind="primary" onClick={confirmRegenerate}>
                {t("confirmRegenerate.confirm")}
              </Button>
            </div>
          }
        />
      )}
    </div>
  );
}
