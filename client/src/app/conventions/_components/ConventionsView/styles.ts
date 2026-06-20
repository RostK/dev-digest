import type { CSSProperties } from "react";

/** Co-located styles for ConventionsView (mirrors SkillsListView). */
export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1100, margin: "0 auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 20 } satisfies CSSProperties,
  headerText: { flex: 1 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  repo: { color: "var(--accent)" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  error: {
    padding: "10px 14px",
    borderRadius: 8,
    background: "var(--crit-bg, rgba(239,68,68,0.1))",
    color: "var(--crit)",
    fontSize: 13,
    marginBottom: 14,
  } satisfies CSSProperties,
  toolbar: { display: "flex", alignItems: "center", gap: 14, marginBottom: 14 } satisfies CSSProperties,
  acceptedCount: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  deselect: {
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    fontSize: 13,
    textDecoration: "underline",
    padding: 0,
  } satisfies CSSProperties,
  cards: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
} as const;
