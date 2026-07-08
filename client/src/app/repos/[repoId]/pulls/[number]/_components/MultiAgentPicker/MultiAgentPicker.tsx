/* MultiAgentPicker — replaces RunReviewDropdown (SPEC-06 AC-1). A multi-select
   "Pick agents to run" popover: a checkbox per workspace agent (each showing a
   ~Ns pre-run estimate, or "— · no history" — never a fabricated number,
   AC-6), a Clear link, a primary "Run multi-agent review (N)" button, and a
   "Configure agents…" footer link into the Configure-run page. Confirming
   starts ONE new multi-run (useStartMultiRun) and navigates to its results
   page (AC-2). An in-flight guard disables the run control while the launch
   is pending so a double-click creates exactly one run (AC-23). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Checkbox, Icon } from "@devdigest/ui";
import { useAgents } from "@/lib/hooks/agents";
import { useAgentEstimates, useStartMultiRun } from "@/lib/hooks/multiAgent";
import { estimateLabel } from "./helpers";
import { PANEL_WIDTH } from "./constants";
import { s } from "./styles";

export interface MultiAgentPickerProps {
  prId: string;
  size?: "sm" | "md" | "lg";
  kind?: "primary" | "secondary";
  /** PR is already merged/closed — dim the trigger and warn, but still allow. */
  warnMerged?: boolean;
}

export function MultiAgentPicker({
  prId,
  size = "sm",
  kind = "primary",
  warnMerged = false,
}: MultiAgentPickerProps) {
  const t = useTranslations("multiAgentConfig");
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [launching, setLaunching] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  const { data: agents } = useAgents();
  const { data: estimates } = useAgentEstimates();
  const start = useStartMultiRun();

  const all = agents ?? [];
  const estimateByAgent = React.useMemo(
    () => new Map((estimates ?? []).map((e) => [e.agent_id, e])),
    [estimates],
  );

  React.useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const toggle = (agentId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
  };
  const clear = () => setSelected(new Set());

  const canRun = selected.size > 0 && !launching;

  const handleRun = async () => {
    if (!canRun) return;
    setLaunching(true);
    try {
      const res = await start.mutateAsync({ prId, agentIds: Array.from(selected) });
      setOpen(false);
      router.push(`/multi-agent/runs/${res.id}`);
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div ref={ref} style={s.root}>
      <span
        title={warnMerged ? t("picker.mergedTooltip") : undefined}
        style={warnMerged ? { opacity: 0.6 } : undefined}
      >
        <Button
          kind={kind}
          size={size}
          icon="Sparkles"
          iconRight="ChevronDown"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {t("picker.trigger")}
        </Button>
      </span>
      {open && (
        <div style={{ ...s.panel, width: PANEL_WIDTH }} aria-label={t("picker.trigger")}>
          {warnMerged && (
            <>
              <div style={s.mergedWarning}>
                <Icon.AlertTriangle size={13} style={{ color: "var(--warn)", flexShrink: 0 }} />
                <span>{t("picker.mergedWarning")}</span>
              </div>
              <div style={s.divider} />
            </>
          )}

          {all.length === 0 ? (
            <button
              type="button"
              style={s.emptyRow}
              onClick={() => router.push("/agents")}
            >
              <Icon.Plus size={14} style={{ color: "var(--text-muted)" }} />
              {t("picker.empty")}
            </button>
          ) : (
            <div style={s.list}>
              {all.map((agent) => (
                <div key={agent.id} style={s.row}>
                  <Checkbox
                    checked={selected.has(agent.id)}
                    onChange={() => toggle(agent.id)}
                    label={
                      <span style={s.rowLabel}>
                        <span style={s.agentName}>{agent.name}</span>
                        <span style={s.estimate}>
                          {estimateLabel(t, estimateByAgent.get(agent.id))}
                        </span>
                      </span>
                    }
                  />
                </div>
              ))}
            </div>
          )}

          <div style={s.divider} />
          <div style={s.actionsRow}>
            <button type="button" style={s.clearLink} onClick={clear}>
              {t("picker.clear")}
            </button>
            <Button kind="primary" size="sm" onClick={handleRun} disabled={!canRun} loading={launching}>
              {launching ? t("picker.starting") : t("picker.runButton", { count: selected.size })}
            </Button>
          </div>
          <button
            type="button"
            style={s.footerLink}
            onClick={() => {
              setOpen(false);
              router.push("/multi-agent/configure");
            }}
          >
            {t("picker.configureAgents")}
          </button>
        </div>
      )}
    </div>
  );
}
