import type { CSSProperties } from "react";

/** Co-located styles for VersionsTab. */
export const s = {
  wrap: { maxWidth: 820 } satisfies CSSProperties,
  heading: { fontSize: 14, fontWeight: 700, marginBottom: 12 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  row: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    overflow: "hidden",
  } satisfies CSSProperties,
  rowHead: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  date: { marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  body: {
    fontSize: 12,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
    padding: 12,
    margin: 0,
    maxHeight: 240,
    overflow: "auto",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
