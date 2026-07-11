import type { CiExportInput, CiFailOn } from "@devdigest/shared";

/** CI gate policy options — mirrors ConfigTab's CI_FAIL_ON_VALUES (labels i18n'd
 *  under the `ci` namespace here, since the rest of this tab's copy lives there). */
export const CI_FAIL_ON_VALUES: readonly CiFailOn[] = ["never", "critical", "warning", "any"];

/** "Update CI config" re-exports with the default trigger set (AC-19) — the
 *  installation itself doesn't store the triggers it was last exported with. */
export const DEFAULT_TRIGGERS: CiExportInput["triggers"] = ["opened", "synchronize", "reopened"];

export const DEFAULT_BASE = "main";
