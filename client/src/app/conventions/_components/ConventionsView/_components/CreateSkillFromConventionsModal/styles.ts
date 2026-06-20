import type { CSSProperties } from "react";

/** Co-located styles for CreateSkillFromConventionsModal. */
export const s = {
  footer: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  savedHint: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  body: { padding: 24, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  merged: {
    padding: "10px 12px",
    borderRadius: 8,
    background: "var(--accent-bg)",
    color: "var(--text-secondary)",
    fontSize: 13,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  row: { display: "flex", gap: 16, alignItems: "flex-start" } satisfies CSSProperties,
} as const;
