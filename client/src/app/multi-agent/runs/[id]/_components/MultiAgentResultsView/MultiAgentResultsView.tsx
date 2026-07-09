/* MultiAgentResultsView — the Multi-Agent Review results page (SPEC-06,
   T4). Header (PR reference + agent-count/duration/cost totals + Configure
   run) → Columns/Tabs switcher (AC-12) → the active mode → the reused
   "Where agents disagree" block (T5's ConflictsBlock, AC-15) → the PR's
   multi-run history (MultiRunHistoryList, AC-25).

   Live per-agent status (AC-10/AC-11): while at least one column is
   `running`, subscribe to its run(s) over the existing SSE stream
   (useRunEvents) and overlay derived status onto the persisted columns
   (deriveLiveColumns). Once every subscribed stream closes, refetch the
   multi-run once to pick up the settled duration/cost/score/conflicts — a
   COMPLETED multi-run never opens a stream at all (spec edge case).

   `View trace` in both modes mounts the relocated `RunTraceDrawer` verbatim
   (AC-21) — no new trace viewer. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import RunTraceDrawer from "@/components/RunTraceDrawer";
import { formatCostCompact } from "@/components/RunCostBadge";
import { useMultiRun } from "@/lib/hooks/multiAgent";
import { usePrReviews, useRunEvents } from "@/lib/hooks/reviews";
import { ConflictsBlock } from "@/app/multi-agent/_components/ConflictsBlock";
import { MultiRunHistoryList } from "@/app/multi-agent/_components/MultiRunHistoryList";
import { ColumnsView } from "./ColumnsView";
import { TabsView } from "./TabsView";
import { buildFindingMap, deriveLiveColumns, findingsForRun, formatDurationLabel } from "./helpers";
import { s } from "./styles";

export interface MultiAgentResultsViewProps {
  runId: string;
}

type Mode = "columns" | "tabs";

export function MultiAgentResultsView({ runId }: MultiAgentResultsViewProps) {
  const t = useTranslations("multiAgentReview");
  const router = useRouter();
  const { data: run, isLoading, isError, refetch } = useMultiRun(runId);
  const { data: reviews } = usePrReviews(run?.pr_id ?? null);

  const [mode, setMode] = React.useState<Mode>("columns");
  const [traceRunId, setTraceRunId] = React.useState<string | null>(null);
  // Set when a Columns finding row is clicked: jump to that agent's Tabs detail
  // with the finding expanded (AC-13 reachability without leaving the results
  // page). Cleared when the user manually re-selects the Tabs layout.
  const [focus, setFocus] = React.useState<{ runId: string; findingId: string } | null>(null);

  const openFinding = React.useCallback((runId: string, findingId: string) => {
    setFocus({ runId, findingId });
    setMode("tabs");
  }, []);

  // Only subscribe while at least one column is still running — a completed
  // multi-run renders from persisted data with no live stream.
  const runningRunIds = React.useMemo(
    () => (run?.columns ?? []).filter((c) => c.status === "running").map((c) => c.run_id),
    [run],
  );
  const { events, running: liveRunning } = useRunEvents(runningRunIds);

  // Mirrors RunStatus's wasRunning pattern: once every subscribed stream has
  // closed, refetch once so the final duration/cost/score/conflicts land.
  const wasRunning = React.useRef(false);
  React.useEffect(() => {
    if (liveRunning) wasRunning.current = true;
    if (!liveRunning && wasRunning.current) {
      wasRunning.current = false;
      void refetch();
    }
  }, [liveRunning, refetch]);

  const columns = React.useMemo(
    () => (run ? deriveLiveColumns(run.columns, events) : []),
    [run, events],
  );
  const findingMap = React.useMemo(() => buildFindingMap(reviews ?? []), [reviews]);

  if (isLoading) {
    return (
      <AppShell crumb={[{ label: t("crumb.lab") }, { label: t("crumb.title") }]}>
        <div style={s.page}>
          <Skeleton height={400} />
        </div>
      </AppShell>
    );
  }

  if (isError || !run) {
    return (
      <AppShell crumb={[{ label: t("crumb.lab") }, { label: t("crumb.title") }]}>
        <ErrorState title={t("error.title")} onRetry={() => void refetch()} fullScreen />
      </AppShell>
    );
  }

  const traceColumn = columns.find((c) => c.run_id === traceRunId);

  return (
    <AppShell crumb={[{ label: t("crumb.lab") }, { label: t("crumb.title") }]}>
      <div style={s.page}>
        <header style={s.header}>
          <div>
            <div style={s.prLine}>
              {run.pr_number != null ? t("header.prReference", { number: run.pr_number }) : t("header.noPr")}
            </div>
            <h1 style={s.title}>{t("header.title")}</h1>
          </div>
          <div style={s.headerRight}>
            <span style={s.totals}>
              {t("header.totals", {
                agents: run.agent_count,
                duration: formatDurationLabel(run.total_duration_ms),
                cost: formatCostCompact(run.total_cost_usd),
              })}
            </span>
            <Button
              kind="secondary"
              size="sm"
              icon="Settings"
              onClick={() => router.push("/multi-agent/configure")}
            >
              {t("header.configureRun")}
            </Button>
          </div>
        </header>

        <div style={s.switcher} role="group" aria-label={t("switcher.label")}>
          <Button
            kind={mode === "columns" ? "primary" : "secondary"}
            size="sm"
            aria-pressed={mode === "columns"}
            onClick={() => setMode("columns")}
          >
            {t("switcher.columns")}
          </Button>
          <Button
            kind={mode === "tabs" ? "primary" : "secondary"}
            size="sm"
            aria-pressed={mode === "tabs"}
            onClick={() => {
              setFocus(null);
              setMode("tabs");
            }}
          >
            {t("switcher.tabs")}
          </Button>
        </div>

        {mode === "columns" ? (
          <ColumnsView columns={columns} onOpenTrace={setTraceRunId} onOpenFinding={openFinding} />
        ) : (
          <TabsView
            columns={columns}
            prId={run.pr_id}
            findingMap={findingMap}
            onOpenTrace={setTraceRunId}
            focusRunId={focus?.runId}
            focusFindingId={focus?.findingId}
          />
        )}

        <ConflictsBlock conflicts={run.conflicts} />

        <MultiRunHistoryList prId={run.pr_id} agentIds={run.columns.map((c) => c.agent_id)} />
      </div>

      {traceRunId && (
        <RunTraceDrawer
          runId={traceRunId}
          agentName={traceColumn?.agent_name ?? null}
          prNumber={run.pr_number ?? undefined}
          findings={findingsForRun(reviews ?? [], traceRunId)}
          running={traceColumn?.status === "running"}
          onClose={() => setTraceRunId(null)}
        />
      )}
    </AppShell>
  );
}
