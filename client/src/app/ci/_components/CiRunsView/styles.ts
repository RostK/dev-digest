import type { CSSProperties } from "react";

/** Co-located styles for the CI Runs page. */
export const s = {
  page: { padding: "24px 28px", display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  h1: { fontSize: 20, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,

  table: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    overflow: "hidden",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  headRow: {
    display: "grid",
    gridTemplateColumns: "1.6fr 1fr 0.8fr 1fr 0.8fr 0.8fr",
    gap: 12,
    padding: "10px 16px",
    background: "var(--bg-surface)",
    borderBottom: "1px solid var(--border)",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  row: {
    display: "grid",
    gridTemplateColumns: "1.6fr 1fr 0.8fr 1fr 0.8fr 0.8fr",
    gap: 12,
    padding: "12px 16px",
    borderBottom: "1px solid var(--border)",
    alignItems: "center",
    fontSize: 13,
  } satisfies CSSProperties,
  repoCell: { display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)" } satisfies CSSProperties,
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
