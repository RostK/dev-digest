/* ConfigureRunView — /multi-agent/configure (SPEC-06 AC-3/AC-4/AC-6). Step 1:
   pick a pull request (reuses the same usePulls hook the Pull Requests page
   fetches from, scoped to the active repo). Step 2: agent checkbox cards
   (name, last-run summary on this PR, per-agent time·cost estimate), a
   `Select all` link, and a `Run multi-agent review (N)` button with the
   client-side aggregated summary estimate beside it. While no PR is selected,
   step 2 shows a placeholder and the run button is non-actionable (AC-4). An
   in-flight guard disables the run control while a launch is pending so a
   double-click can't create a duplicate multi-run (AC-23). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Card, Checkbox, EmptyState, SelectInput, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { formatCostCompact } from "@/components/RunCostBadge";
import { useActiveRepo } from "@/lib/repo-context";
import { usePulls } from "@/lib/hooks";
import { useAgents } from "@/lib/hooks/agents";
import { usePrReviews } from "@/lib/hooks/reviews";
import { useAgentEstimates, useStartMultiRun } from "@/lib/hooks/multiAgent";
import { aggregateEstimate, lastRunSummaryByAgent } from "./helpers";
import { s } from "./styles";

export function ConfigureRunView() {
  const t = useTranslations("multiAgentConfig");
  const router = useRouter();
  const { repoId } = useActiveRepo();

  const { data: pulls, isLoading: pullsLoading } = usePulls(repoId);
  const { data: agents, isLoading: agentsLoading } = useAgents();
  const { data: estimates } = useAgentEstimates();

  const [prId, setPrId] = React.useState("");
  const { data: reviews } = usePrReviews(prId || null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [launching, setLaunching] = React.useState(false);
  const start = useStartMultiRun();

  const all = agents ?? [];
  const prOptions = (pulls ?? []).filter((p): p is typeof p & { id: string } => !!p.id);
  const summaryByAgent = React.useMemo(() => lastRunSummaryByAgent(reviews ?? []), [reviews]);
  const estimateByAgent = React.useMemo(
    () => new Map((estimates ?? []).map((e) => [e.agent_id, e])),
    [estimates],
  );

  const toggle = (agentId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(all.map((a) => a.id)));

  const agg = aggregateEstimate(Array.from(selected), estimateByAgent);
  const canRun = !!prId && selected.size > 0 && !launching;

  const handleRun = async () => {
    if (!canRun) return;
    setLaunching(true);
    try {
      const res = await start.mutateAsync({ prId, agentIds: Array.from(selected) });
      router.push(`/multi-agent/runs/${res.id}`);
    } finally {
      setLaunching(false);
    }
  };

  return (
    <AppShell crumb={[{ label: t("configure.crumbLab") }, { label: t("configure.crumbTitle") }]}>
      <div style={s.page}>
        <h1 style={s.h1}>{t("configure.title")}</h1>

        <section style={s.section}>
          <div style={s.stepLabel}>{t("configure.step1.label")}</div>
          {pullsLoading ? (
            <Skeleton height={40} />
          ) : (
            <SelectInput
              value={prId}
              onChange={(v) => {
                setPrId(v);
                setSelected(new Set());
              }}
              options={[
                { value: "", label: t("configure.step1.placeholder") },
                ...prOptions.map((p) => ({ value: p.id, label: `#${p.number} ${p.title}` })),
              ]}
            />
          )}
        </section>

        <section style={s.section}>
          <div style={s.stepHeader}>
            <div style={s.stepLabel}>{t("configure.step2.label")}</div>
            {!!prId && all.length > 0 && (
              <button type="button" style={s.selectAll} onClick={selectAll}>
                {t("configure.step2.selectAll")}
              </button>
            )}
          </div>

          {!prId ? (
            <EmptyState
              icon="GitPullRequest"
              title={t("configure.step2.noPrTitle")}
              body={t("configure.step2.noPrBody")}
            />
          ) : agentsLoading ? (
            <Skeleton height={120} />
          ) : all.length === 0 ? (
            <EmptyState
              icon="Cpu"
              title={t("configure.step2.noAgentsTitle")}
              body={t("configure.step2.noAgentsBody")}
            />
          ) : (
            <div style={s.cards}>
              {all.map((agent) => {
                const est = estimateByAgent.get(agent.id);
                const estimateText = est?.has_history
                  ? t("configure.step2.estimate", {
                      time: `${((est.duration_ms ?? 0) / 1000).toFixed(1)}s`,
                      cost: formatCostCompact(est.cost_usd),
                    })
                  : t("picker.noHistory");
                return (
                  <Card key={agent.id} style={s.card}>
                    <Checkbox
                      checked={selected.has(agent.id)}
                      onChange={() => toggle(agent.id)}
                      label={
                        <div style={s.cardBody}>
                          <div style={s.cardTopRow}>
                            <span style={s.cardName}>{agent.name}</span>
                            <span style={s.cardEstimate}>{estimateText}</span>
                          </div>
                          <span style={s.cardSummary}>
                            {summaryByAgent.get(agent.id) ?? t("configure.step2.noRuns")}
                          </span>
                        </div>
                      }
                    />
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        <div style={s.footer}>
          <Button kind="primary" onClick={handleRun} disabled={!canRun} loading={launching}>
            {launching ? t("configure.starting") : t("configure.runButton", { count: selected.size })}
          </Button>
          <span style={s.summary}>
            {selected.size === 0
              ? t("configure.summaryEmpty")
              : t(agg.partial ? "configure.summaryPartial" : "configure.summary", {
                  time: agg.timeLabel,
                  cost: agg.costLabel,
                })}
          </span>
        </div>
      </div>
    </AppShell>
  );
}
