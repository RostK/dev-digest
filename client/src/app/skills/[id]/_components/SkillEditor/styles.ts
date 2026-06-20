import type { CSSProperties } from "react";

/** Co-located styles for SkillEditor. */
export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 860, margin: "0 auto" } satisfies CSSProperties,
  loading: { display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  form: { maxWidth: 760 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", marginBottom: 18 } satisfies CSSProperties,
  back: {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "var(--text-secondary)",
    fontSize: 13,
    padding: 0,
  } satisfies CSSProperties,
  enabledLabel: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  actions: { display: "flex", gap: 12, alignItems: "center", marginTop: 12 } satisfies CSSProperties,
  savedNote: { fontSize: 13, color: "var(--ok)" } satisfies CSSProperties,
  delete: {
    marginLeft: "auto",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "var(--crit)",
    fontSize: 13,
  } satisfies CSSProperties,
} as const;
