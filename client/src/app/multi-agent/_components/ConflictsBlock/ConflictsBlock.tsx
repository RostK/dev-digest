/* ConflictsBlock — the "Where agents disagree" block (T5, AC-15/16/17). Pure
   presentational: consumes `conflicts: Conflict[]` as computed server-side by
   the deterministic conflict builder (T2) — no data fetching, no LLM, nothing
   computed here beyond the local `hasDivergence` filter. Self-contained leaf
   component under multi-agent/_components so T4 can render it without forking
   anything. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, SeverityBadge, EmptyState, SEV, type Severity } from "@devdigest/ui";
import type { Conflict, ConflictTake } from "@devdigest/shared";
import { hasDivergence } from "./helpers";
import { s } from "./styles";

export interface ConflictsBlockProps {
  conflicts: Conflict[];
}

export function ConflictsBlock({ conflicts }: ConflictsBlockProps) {
  const t = useTranslations("multiAgentFindings");
  const [onlyConflicts, setOnlyConflicts] = React.useState(false);

  const visible = React.useMemo(
    () => (onlyConflicts ? conflicts.filter(hasDivergence) : conflicts),
    [conflicts, onlyConflicts],
  );

  // Nothing to show at all (e.g. a single-agent multi-run, or all-failed
  // agents) — an absent block, never a hard error (spec Edge cases).
  if (conflicts.length === 0) return null;

  return (
    <section aria-label={t("conflicts.title")} style={s.section}>
      <div style={s.header}>
        <h2 style={s.heading}>{t("conflicts.title")}</h2>
        <label style={s.toggleRow}>
          <Toggle on={onlyConflicts} onChange={setOnlyConflicts} size={16} />
          <span>{t("conflicts.onlyConflicts")}</span>
        </label>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon="Filter"
          title={t("conflicts.emptyTitle")}
          body={t("conflicts.emptyBody")}
        />
      ) : (
        <div style={s.groupList}>
          {visible.map((conflict) => (
            <ConflictGroup
              key={`${conflict.file}:${conflict.line}:${conflict.title}`}
              conflict={conflict}
              didNotFlagLabel={t("conflicts.didNotFlag")}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ConflictGroup({
  conflict,
  didNotFlagLabel,
}: {
  conflict: Conflict;
  didNotFlagLabel: string;
}) {
  return (
    <div style={s.card}>
      <div style={s.cardHeader}>
        <span className="mono" style={s.location}>
          {conflict.file}:{conflict.line}
        </span>
        <span style={s.title}>{conflict.title}</span>
      </div>
      <div style={s.takes}>
        {conflict.takes.map((take) => (
          <ConflictTakeCell key={take.agent_id} take={take} didNotFlagLabel={didNotFlagLabel} />
        ))}
      </div>
    </div>
  );
}

function ConflictTakeCell({
  take,
  didNotFlagLabel,
}: {
  take: ConflictTake;
  didNotFlagLabel: string;
}) {
  const didNotFlag = take.verdict === "ignored";
  const sevInfo = didNotFlag ? null : SEV[take.verdict as Severity];
  return (
    <div style={s.takeCell}>
      <div style={s.takeHeader}>
        <span style={s.agentName}>{take.persona}</span>
        {didNotFlag ? (
          <span style={s.didNotFlag}>{didNotFlagLabel}</span>
        ) : (
          <span title={sevInfo?.label} aria-label={sevInfo?.label}>
            <SeverityBadge severity={take.verdict as Severity} compact />
          </span>
        )}
      </div>
      <p style={s.note}>{take.note}</p>
    </div>
  );
}
