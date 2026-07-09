"use client";

/* CI tab — installations grouped by repo + run history, Add to CI (opens the
   Export Wizard), Update CI config (re-exports to the same devdigest/ci
   branch, reusing the PR — the SAME install path, AC-19), and Fail CI on
   (persists to `agents.ciFailOn` via the EXISTING `useUpdateAgent`). */

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, FormField, Icon, SelectInput, Skeleton } from "@devdigest/ui";
import type { CiFailOn } from "@devdigest/shared";
import { useAgent, useUpdateAgent } from "@/lib/hooks/agents";
import { useAgentCiRuns, useAgentInstallations, useCiInstall, useSyncInstallation } from "@/lib/hooks/ci";
import { relativeTime } from "@/lib/relative-time";
import { ciRunStatusLabel } from "@/lib/ci-run-status";
import { ExportWizard } from "../ExportWizard";
import { CI_FAIL_ON_VALUES, DEFAULT_BASE, DEFAULT_TRIGGERS } from "./constants";
import { groupRunsByInstallation } from "./helpers";
import { s } from "./styles";

export function CiTab({ agentId }: { agentId: string }) {
  const t = useTranslations("ci");
  const { data: agent } = useAgent(agentId);
  const update = useUpdateAgent();
  const { data: installations, isLoading } = useAgentInstallations(agentId);
  const { data: runs } = useAgentCiRuns(agentId);
  const sync = useSyncInstallation();
  const install = useCiInstall(agentId);
  const [wizardOpen, setWizardOpen] = React.useState(false);

  const runsByInstallation = React.useMemo(() => groupRunsByInstallation(runs), [runs]);

  const failCiOnOptions = CI_FAIL_ON_VALUES.map((v) => ({ value: v, label: t(`ciTab.failCiOnOptions.${v}`) }));

  const updateConfig = (repo: string, targetType: "gha" | "circle" | "jenkins" | "cli") =>
    install.mutate({
      repo,
      target: targetType,
      action: "open_pr",
      post_as: "github_review",
      triggers: DEFAULT_TRIGGERS,
      base: DEFAULT_BASE,
    });

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("ciTab.heading")}</h2>
        <Button kind="primary" size="sm" icon="Upload" onClick={() => setWizardOpen(true)}>
          {t("ciTab.exportToCi")}
        </Button>
      </div>
      <p style={s.hint}>{t("ciTab.subtitle")}</p>

      {agent && (
        <FormField label={t("ciTab.failCiOn")} hint={t("ciTab.failCiOnHint")}>
          <SelectInput
            value={agent.ci_fail_on}
            onChange={(v) => update.mutate({ id: agentId, patch: { ci_fail_on: v as CiFailOn } })}
            options={failCiOnOptions}
            mono={false}
          />
        </FormField>
      )}

      {isLoading && <Skeleton height={90} />}

      {!isLoading && (!installations || installations.length === 0) && (
        <EmptyState
          icon="Workflow"
          title={t("ciTab.emptyTitle")}
          body={t("ciTab.empty")}
          cta={t("ciTab.exportToCi")}
          onCta={() => setWizardOpen(true)}
        />
      )}

      {!!installations && installations.length > 0 && (
        <div style={s.repoList}>
          {installations.map((inst) => {
            const instRuns = runsByInstallation.get(inst.id) ?? [];
            const syncing = sync.isPending && sync.variables === inst.id;
            return (
              <div key={inst.id} style={s.repoCard}>
                <div style={s.repoHeader}>
                  <Icon.GitBranch size={14} style={{ color: "var(--text-muted)" }} />
                  <span className="mono" style={s.repoName}>
                    {inst.repo}
                  </span>
                  <Badge color="var(--text-secondary)">{inst.target_type}</Badge>
                  <span style={s.installedNote}>
                    {t("ciTab.installed", { date: new Date(inst.installed_at).toLocaleDateString() })}
                  </span>
                  <div style={s.repoActions}>
                    <Button
                      kind="ghost"
                      size="sm"
                      icon="RefreshCw"
                      loading={syncing}
                      disabled={sync.isPending}
                      onClick={() => sync.mutate(inst.id)}
                    >
                      {syncing ? t("ciTab.syncing") : t("ciTab.sync")}
                    </Button>
                    <Button
                      kind="secondary"
                      size="sm"
                      disabled={install.isPending}
                      onClick={() => updateConfig(inst.repo, inst.target_type)}
                    >
                      {t("ciTab.update")}
                    </Button>
                  </div>
                </div>

                {instRuns.length === 0 ? (
                  <p style={s.hint}>{t("ciTab.noRuns")}</p>
                ) : (
                  <div style={s.runList}>
                    <div style={s.hint}>{t("ciTab.runsHeading")}</div>
                    {instRuns.slice(0, 5).map((run) => (
                      <div key={run.id} style={s.runRow}>
                        <span>{run.pr_number != null ? `#${run.pr_number}` : "—"}</span>
                        <span>{ciRunStatusLabel(run.status, t)}</span>
                        <span>{relativeTime(run.ran_at)}</span>
                        {run.github_url ? (
                          <a
                            className="mono"
                            href={run.github_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "var(--accent-text)" }}
                          >
                            {t("runs.view")}
                          </a>
                        ) : (
                          <span />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {wizardOpen && (
        <ExportWizard agentId={agentId} agentName={agent?.name ?? ""} onClose={() => setWizardOpen(false)} />
      )}
    </div>
  );
}
