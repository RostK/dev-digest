import type { IconName } from "@devdigest/ui";

/** Skills Lab detail tab descriptor. `labelKey` resolves under the `skills` ns. */
export interface SkillTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

/** Detail tabs (mirrors the AgentEditor tab pattern). Config is the live editor;
 *  Preview/Versions read existing data; Stats is a later-lesson placeholder. */
export const TABS: readonly SkillTab[] = [
  { key: "config", labelKey: "detail.tabs.config", icon: "Settings" },
  { key: "preview", labelKey: "detail.tabs.preview", icon: "Eye" },
  { key: "stats", labelKey: "detail.tabs.stats", icon: "BarChart" },
  { key: "versions", labelKey: "detail.tabs.versions", icon: "History" },
];

/** Tab keys accepted from ?tab= ; anything else falls back to "config". */
export const VALID_TABS = TABS.map((t) => t.key);
