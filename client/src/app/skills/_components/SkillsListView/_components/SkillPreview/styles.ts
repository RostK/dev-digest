import type { CSSProperties } from "react";

/** Co-located styles for SkillPreview. */
export const s = {
  footer: { display: "flex", gap: 10, alignItems: "center", justifyContent: "flex-end" } satisfies CSSProperties,
  enabledLabel: {
    marginRight: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  body: { padding: 24 } satisfies CSSProperties,
  metaRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12 } satisfies CSSProperties,
  description: { fontSize: 13, color: "var(--text-secondary)", marginBottom: 14, lineHeight: 1.5 } satisfies CSSProperties,
  bodyText: {
    fontSize: 12.5,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 14,
    maxHeight: 360,
    overflow: "auto",
    margin: 0,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
