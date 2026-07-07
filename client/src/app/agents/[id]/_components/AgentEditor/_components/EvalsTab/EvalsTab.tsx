/* Evals tab (T8, SPEC-05) — this agent's eval-case list with pass/fail/never-run
   state, a "Run all" action that kicks off the eval set, and a link out to the
   full per-agent dashboard (/evals/:agentId). Data comes from
   `useAgentEvalCases`/`useRunEvalSet` (src/lib/hooks/evals) — no fetch here;
   the run mutation's own onSuccess invalidates the cases list so this table
   refreshes automatically. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, SectionLabel } from "@devdigest/ui";
import { useAgentEvalCases, useRunEvalSet } from "@/lib/hooks/evals";
import { s } from "./styles";

const MIN_CASES_FOR_SIGNAL = 8;

function CaseStatusBadge({ lastRunPass }: { lastRunPass: boolean | null }) {
  const t = useTranslations("evals");
  if (lastRunPass === null) {
    return <Badge color="var(--text-muted)">{t("evalsTab.statusNeverRun")}</Badge>;
  }
  return lastRunPass ? (
    <Badge color="var(--ok)" bg="var(--ok-bg)">
      {t("evalsTab.statusPass")}
    </Badge>
  ) : (
    <Badge color="var(--crit)" bg="var(--crit-bg)">
      {t("evalsTab.statusFail")}
    </Badge>
  );
}

export function EvalsTab({ agentId }: { agentId: string }) {
  const t = useTranslations("evals");
  const casesQ = useAgentEvalCases(agentId);
  const runSet = useRunEvalSet();

  const cases = casesQ.data ?? [];
  const running = runSet.isPending;
  const runCases = cases.filter((c) => c.last_run_pass !== null);
  const passedCount = runCases.filter((c) => c.last_run_pass).length;

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <SectionLabel icon="Gauge">{t("evalsTab.title")}</SectionLabel>
        </div>
        <div style={s.actions}>
          {/* Eval cases are created finding-centrically ("Turn into eval case"
              on an accepted/dismissed finding) — there is no manual create-case
              endpoint, so no "New case" button here (a dead no-op stub before). */}
          <Button
            kind="primary"
            size="sm"
            icon="Play"
            loading={running}
            disabled={cases.length === 0}
            onClick={() => runSet.mutate(agentId)}
          >
            {running ? t("evalsTab.running") : t("evalsTab.runAll")}
          </Button>
        </div>
      </div>

      {cases.length < MIN_CASES_FOR_SIGNAL && (
        <p style={s.hint}>{t("evalsTab.minCasesHint", { count: cases.length })}</p>
      )}

      {cases.length === 0 ? (
        <EmptyState icon="Gauge" title={t("evalsTab.empty")} />
      ) : (
        <>
          <div style={s.tableCard}>
            <div style={s.theadRow}>
              <span>{t("evalsTab.colCase")}</span>
              <span>{t("evalsTab.colStatus")}</span>
              <span>{t("evalsTab.colExpected")}</span>
              <span>{t("evalsTab.colActual")}</span>
            </div>
            {cases.map((c, i) => (
              <div key={c.id} style={{ ...s.row, ...(i === cases.length - 1 ? s.rowLast : {}) }}>
                <span style={s.caseName}>{c.name}</span>
                <CaseStatusBadge lastRunPass={c.last_run_pass} />
                <span style={s.metric}>{c.expected_count}</span>
                <span style={s.metric}>{c.actual_count}</span>
              </div>
            ))}
          </div>
          {runCases.length > 0 && (
            <p style={s.summary}>
              {t("evalsTab.runSummary", { passed: passedCount, total: runCases.length })}
            </p>
          )}
        </>
      )}

      <div style={s.footer}>
        <Link href={`/evals/${agentId}`} style={s.viewDashboardLink}>
          {t("evalsTab.viewDashboard")}
        </Link>
      </div>
    </div>
  );
}
