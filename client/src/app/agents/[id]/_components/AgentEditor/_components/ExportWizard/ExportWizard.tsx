"use client";

/* Export Wizard — 4-step modal (Target → Preview → Configure → Install,
   AC-5): serializes the agent to a GitHub Actions bundle and either opens a
   PR or returns the files to copy. Step state is local (`useState`); server
   data (the preview bundle + the install result) comes straight off the
   TanStack Query mutations (`preview.data` / `install.data`) rather than
   being re-stored in component state. */

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ExportWizardSteps, Modal } from "@devdigest/ui";
import type { CiExportInput, CiTarget } from "@devdigest/shared";
import { useCiInstall, useCiPreview } from "@/lib/hooks/ci";
import { DEFAULT_BASE, DEFAULT_TRIGGERS, STEP_KEYS, type CiTrigger } from "./constants";
import { TargetStep } from "./TargetStep";
import { PreviewStep } from "./PreviewStep";
import { ConfigureStep } from "./ConfigureStep";
import { InstallStep } from "./InstallStep";
import { s } from "./styles";

type PostAs = CiExportInput["post_as"];
type InstallAction = "open_pr" | "files";

export function ExportWizard({
  agentId,
  agentName,
  onClose,
}: {
  agentId: string;
  agentName: string;
  onClose: () => void;
}) {
  const t = useTranslations("ci");

  const [step, setStep] = React.useState(0);
  const [target, setTarget] = React.useState<CiTarget>("gha");
  const [repo, setRepo] = React.useState("");
  const [triggers, setTriggers] = React.useState<CiTrigger[]>(DEFAULT_TRIGGERS);
  const [postAs, setPostAs] = React.useState<PostAs>("github_review");
  const [pendingInstallAction, setPendingInstallAction] = React.useState<InstallAction | null>(null);
  // The user's hand-edited workflow YAML from Preview (AC-4); null until touched.
  const [workflowOverride, setWorkflowOverride] = React.useState<string | null>(null);

  const preview = useCiPreview(agentId);
  const install = useCiInstall(agentId);

  const toggleTrigger = (trigger: CiTrigger) =>
    setTriggers((prev) => (prev.includes(trigger) ? prev.filter((tr) => tr !== trigger) : [...prev, trigger]));

  const buildInput = (action: InstallAction): CiExportInput => ({
    repo: repo.trim(),
    target,
    action,
    post_as: postAs,
    triggers,
    base: DEFAULT_BASE,
    workflow_override: workflowOverride ?? undefined,
  });

  const goBack = () => setStep((cur) => Math.max(0, cur - 1));

  const goNext = () => {
    if (step === 0) {
      // Fresh preview → drop any prior hand-edit so the textarea shows the
      // newly generated workflow, not stale edited text.
      setWorkflowOverride(null);
      preview.mutate(buildInput("open_pr"));
      setStep(1);
      return;
    }
    setStep((cur) => Math.min(3, cur + 1));
  };

  const runInstall = (action: InstallAction) => {
    setPendingInstallAction(action);
    install.mutate(buildInput(action), { onSettled: () => setPendingInstallAction(null) });
  };

  const canContinue =
    step === 0
      ? target === "gha" && repo.trim().length > 0
      : step === 1
        ? !preview.isPending && !preview.isError && !!preview.data
        : true;

  const stepLabels = STEP_KEYS.map((key) => t(`exportWizard.steps.${key}`));

  return (
    <Modal
      width={720}
      title={t("exportWizard.title")}
      subtitle={t("exportWizard.subtitle", { agentName: agentName || t("exportWizard.thisAgent") })}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <div>
            {step > 0 && (
              <Button kind="ghost" onClick={goBack}>
                {t("exportWizard.back")}
              </Button>
            )}
          </div>
          <div>
            {step < 3 ? (
              <Button kind="primary" onClick={goNext} disabled={!canContinue}>
                {t("exportWizard.continue")}
              </Button>
            ) : (
              <Button kind="secondary" onClick={onClose}>
                {t("exportWizard.done")}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div style={s.stepsBar}>
        <ExportWizardSteps step={step} labels={stepLabels} />
      </div>

      {step === 0 && (
        <TargetStep target={target} onTargetChange={setTarget} repo={repo} onRepoChange={setRepo} />
      )}
      {step === 1 && (
        <PreviewStep
          files={preview.data ?? null}
          loading={preview.isPending}
          error={preview.isError ? t("exportWizard.previewError") : null}
          workflowOverride={workflowOverride}
          onWorkflowChange={setWorkflowOverride}
        />
      )}
      {step === 2 && (
        <ConfigureStep
          triggers={triggers}
          onToggleTrigger={toggleTrigger}
          postAs={postAs}
          onPostAsChange={setPostAs}
        />
      )}
      {step === 3 && (
        <InstallStep
          repo={repo}
          filesCount={preview.data?.length ?? 0}
          onInstall={runInstall}
          pendingAction={pendingInstallAction}
          result={install.data ?? null}
          error={install.isError ? t("exportWizard.installError") : null}
        />
      )}
    </Modal>
  );
}
