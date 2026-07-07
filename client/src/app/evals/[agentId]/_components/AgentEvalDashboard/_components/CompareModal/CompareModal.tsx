/* CompareModal — 2-run compare for an agent's eval history (A4, L06). Shows
   the recall/precision/citation/cost delta between two run groups by ICON +
   TEXT (never color alone, a11y) and both `system_prompt` snapshots
   side-by-side as a diff. The prompt text is UNTRUSTED display data — it is
   rendered as plain text inside a <pre>, never as HTML. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal, Icon, Skeleton, ErrorState } from "@devdigest/ui";
import { useEvalCompare } from "@/lib/hooks/evals";
import { formatCostCompact } from "@/components/RunCostBadge";
import { pct } from "@/app/evals/helpers";
import { s } from "./styles";

type T = ReturnType<typeof useTranslations>;

interface CompareModalProps {
  groupA: string;
  groupB: string;
  onClose: () => void;
}

/** Delta direction as icon + word, never color alone. `higherIsBetter` flips
 *  which direction counts as "improved" (cost: lower is better). */
function DeltaCell({
  delta,
  t,
  higherIsBetter = true,
  format = pct,
}: {
  delta: number | null;
  t: T;
  higherIsBetter?: boolean;
  format?: (n: number) => string;
}) {
  if (delta == null) {
    return <span style={s.deltaCell("var(--text-muted)")}>{t("compare.noChange")}</span>;
  }
  const rounded = Math.round(delta * 1000) / 1000;
  if (rounded === 0) {
    return (
      <span style={s.deltaCell("var(--text-muted)")}>
        <Icon.Slash size={12} />
        {t("compare.noChange")}
      </span>
    );
  }
  const isImprovement = higherIsBetter ? rounded > 0 : rounded < 0;
  const color = isImprovement ? "var(--ok)" : "var(--crit)";
  const label = isImprovement ? t("compare.improved") : t("compare.regressed");
  const DeltaIcon = rounded > 0 ? Icon.ArrowUp : Icon.ArrowDown;
  return (
    <span style={s.deltaCell(color)} title={label}>
      <DeltaIcon size={12} />
      {label} ({format(Math.abs(rounded))})
    </span>
  );
}

export function CompareModal({ groupA, groupB, onClose }: CompareModalProps) {
  const t = useTranslations("evals");
  const { data, isLoading, isError, refetch } = useEvalCompare(groupA, groupB);

  return (
    <Modal
      title={t("compare.title")}
      subtitle={data ? t("compare.subtitle", { a: data.a.group_id, b: data.b.group_id }) : undefined}
      onClose={onClose}
      width={880}
    >
      {isLoading && (
        <div style={s.loading}>
          <Skeleton height={80} />
          <Skeleton height={200} />
        </div>
      )}

      {(isError || (!isLoading && !data)) && (
        <ErrorState title={t("compare.error")} onRetry={() => refetch()} />
      )}

      {!isLoading && data && (
        <div style={s.body}>
          <div style={s.metaRow}>
            <div style={s.metaCol}>
              {t("compare.agentVersion")}
              <div style={s.metaValue}>
                v{data.a.agent_version} → v{data.b.agent_version}
              </div>
            </div>
            <div style={s.metaCol}>
              {t("compare.ranAt")}
              <div style={s.metaValue}>
                {new Date(data.a.ran_at).toLocaleString()} → {new Date(data.b.ran_at).toLocaleString()}
              </div>
            </div>
          </div>

          <div style={s.deltaTable}>
            <div style={s.deltaHeadRow}>
              <span />
              <span>{data.a.group_id}</span>
              <span>{data.b.group_id}</span>
              <span>Δ</span>
            </div>
            <div style={s.deltaRow}>
              <span style={s.metricLabel}>{t("compare.recall")}</span>
              <span style={s.metricValue}>{pct(data.a.recall)}</span>
              <span style={s.metricValue}>{pct(data.b.recall)}</span>
              <DeltaCell delta={data.delta.recall} t={t} />
            </div>
            <div style={s.deltaRow}>
              <span style={s.metricLabel}>{t("compare.precision")}</span>
              <span style={s.metricValue}>{pct(data.a.precision)}</span>
              <span style={s.metricValue}>{pct(data.b.precision)}</span>
              <DeltaCell delta={data.delta.precision} t={t} />
            </div>
            <div style={s.deltaRow}>
              <span style={s.metricLabel}>{t("compare.citation")}</span>
              <span style={s.metricValue}>{pct(data.a.citation_accuracy)}</span>
              <span style={s.metricValue}>{pct(data.b.citation_accuracy)}</span>
              <DeltaCell delta={data.delta.citation_accuracy} t={t} />
            </div>
            <div style={{ ...s.deltaRow, ...s.deltaRowLast }}>
              <span style={s.metricLabel}>{t("compare.cost")}</span>
              <span style={s.metricValue}>{formatCostCompact(data.a.cost_usd)}</span>
              <span style={s.metricValue}>{formatCostCompact(data.b.cost_usd)}</span>
              <DeltaCell
                delta={data.delta.cost_usd}
                t={t}
                higherIsBetter={false}
                format={(n) => formatCostCompact(n)}
              />
            </div>
          </div>

          <div>
            <div style={s.promptsHeading}>{t("compare.systemPrompt")}</div>
            <div style={s.promptGrid}>
              <div style={s.promptCol}>
                <span style={s.promptLabel}>{data.a.group_id}</span>
                <pre style={s.promptBox}>{data.a_system_prompt}</pre>
              </div>
              <div style={s.promptCol}>
                <span style={s.promptLabel}>{data.b.group_id}</span>
                <pre style={s.promptBox}>{data.b_system_prompt}</pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
