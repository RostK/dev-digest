import type { CiTarget } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

/** Target step cards. Only `gha` is functional in v1 — the others render but
 *  never advance to a real export (AC-5/AC-20). */
export interface TargetCardDef {
  target: CiTarget;
  icon: IconName;
  labelKey: string;
  descKey: string;
  functional: boolean;
}

export const TARGET_CARDS: readonly TargetCardDef[] = [
  { target: "gha", icon: "GitBranch", labelKey: "targets.gha", descKey: "targets.ghaDesc", functional: true },
  {
    target: "circle",
    icon: "RefreshCw",
    labelKey: "targets.circle",
    descKey: "targets.circleDesc",
    functional: false,
  },
  {
    target: "jenkins",
    icon: "Wrench",
    labelKey: "targets.jenkins",
    descKey: "targets.jenkinsDesc",
    functional: false,
  },
  { target: "cli", icon: "Code", labelKey: "targets.cli", descKey: "targets.cliDesc", functional: false },
];

/** Wizard step order — index drives the ExportWizardSteps indicator + body switch. */
export const STEP_KEYS = ["target", "preview", "configure", "install"] as const;
export type StepKey = (typeof STEP_KEYS)[number];

export const TRIGGER_OPTIONS = ["opened", "synchronize", "reopened"] as const;
/** Allowed PR-event triggers — mirrors the `CiExportInput.triggers` enum (the
 *  contract restricts these to block YAML injection into the workflow). */
export type CiTrigger = (typeof TRIGGER_OPTIONS)[number];

export const DEFAULT_TRIGGERS: CiTrigger[] = ["opened", "synchronize", "reopened"];

export const DEFAULT_BASE = "main";
