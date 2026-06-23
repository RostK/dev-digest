import type { CSSProperties } from "react";

/** Co-located styles for the SkillDetail panel (mirrors the AgentEditor shell). */
export const s = {
  loading: { display: "flex", flexDirection: "column", gap: 16, padding: 28 } satisfies CSSProperties,
  head: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "18px 28px 0",
    flexShrink: 0,
  } satisfies CSSProperties,
  headIcon: { color: "var(--accent)", flexShrink: 0 } satisfies CSSProperties,
  name: {
    fontSize: 18,
    fontWeight: 700,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: 380,
  } satisfies CSSProperties,
  tabsBar: { marginTop: 14, flexShrink: 0 } satisfies CSSProperties,
  body: { flex: 1, minHeight: 0, overflow: "auto", padding: 28 } satisfies CSSProperties,
} as const;
