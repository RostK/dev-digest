/* SmartDiffViewer — reviewer-ordered diff: files grouped by role (core / wiring /
   boilerplate). Boilerplate section is collapsed by default. Files with finding
   lines show a clickable badge that expands the card and scrolls to the first hit. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { SmartDiff, SmartDiffRole } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import type { DiffCommentApi } from "../comments";
import { FileCard } from "../FileCard";
import { s } from "./styles";

/* ---------- types ---------- */
export interface SmartDiffViewerProps {
  files: PrFile[];
  smartDiff: SmartDiff;
  commenting?: DiffCommentApi;
}

/* ---------- role display map ---------- */
const ROLE_LABEL_KEY: Record<SmartDiffRole, "smartDiff.coreLabel" | "smartDiff.wiringLabel" | "smartDiff.boilerplateLabel"> = {
  core: "smartDiff.coreLabel",
  wiring: "smartDiff.wiringLabel",
  boilerplate: "smartDiff.boilerplateLabel",
};

const ROLE_DESC_KEY: Record<SmartDiffRole, "smartDiff.coreDesc" | "smartDiff.wiringDesc" | "smartDiff.boilerplateDesc"> = {
  core: "smartDiff.coreDesc",
  wiring: "smartDiff.wiringDesc",
  boilerplate: "smartDiff.boilerplateDesc",
};

/* ---------- SplitBanner ---------- */
function SplitBanner({
  totalLines,
  splits,
}: {
  totalLines: number;
  splits: { name: string; files: string[] }[];
}) {
  const t = useTranslations("prReview");
  return (
    <div style={s.banner} role="alert">
      <div style={s.bannerTitle}>
        {t("smartDiff.largeTitle", { lines: totalLines })}
      </div>
      <div style={s.bannerBody}>{t("smartDiff.largeBody")}</div>
      {splits.length > 0 && (
        <ul style={s.bannerSplits}>
          {splits.map((sp) => (
            <li key={sp.name} style={s.bannerSplitItem}>
              <strong>{sp.name}</strong>
              {sp.files.length > 0 && (
                <span style={s.bannerSplitFiles}>
                  ({sp.files.join(", ")})
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- RoleGroup ---------- */
function RoleGroup({
  role,
  files,
  allPrFiles,
  commenting,
  startOpen,
}: {
  role: SmartDiffRole;
  files: { path: string; finding_lines: number[] }[];
  allPrFiles: PrFile[];
  commenting?: DiffCommentApi;
  startOpen: boolean;
}) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(startOpen);

  const label = t(ROLE_LABEL_KEY[role]);
  const desc = t(ROLE_DESC_KEY[role]);
  const count = t("smartDiff.filesCount", { count: files.length });

  return (
    <div style={s.group}>
      <div
        style={s.groupHeader}
        onClick={() => setOpen((o) => !o)}
        role="button"
        aria-expanded={open}
        aria-label={label}
      >
        <Icon.ChevronRight
          size={13}
          style={{
            ...s.groupChevron,
            transform: open ? "rotate(90deg)" : "none",
          }}
        />
        <span style={s.groupTitle}>{label}</span>
        <span style={s.groupDesc}>{desc}</span>
        <span style={s.groupCount}>{count}</span>
      </div>

      {open && (
        <div style={s.fileList}>
          {files.map((sdFile) => {
            const prFile = allPrFiles.find((f) => f.path === sdFile.path);
            if (!prFile) return null;
            return (
              <FileCard
                key={sdFile.path}
                file={prFile}
                commenting={commenting}
                findingLines={sdFile.finding_lines}
                defaultOpen={sdFile.finding_lines.length > 0}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- SmartDiffViewer ---------- */
export function SmartDiffViewer({ files, smartDiff, commenting }: SmartDiffViewerProps) {
  const { split_suggestion } = smartDiff;

  return (
    <div style={s.container}>
      {split_suggestion.too_big && (
        <SplitBanner
          totalLines={split_suggestion.total_lines}
          splits={split_suggestion.proposed_splits}
        />
      )}

      {smartDiff.groups.map((group) => (
        <RoleGroup
          key={group.role}
          role={group.role}
          files={group.files}
          allPrFiles={files}
          commenting={commenting}
          startOpen={group.role !== "boilerplate"}
        />
      ))}
    </div>
  );
}
