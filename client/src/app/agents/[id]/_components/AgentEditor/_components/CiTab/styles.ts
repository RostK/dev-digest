import type { CSSProperties } from "react";

/** Co-located styles for the Agent Editor → CI tab. */
export const s = {
  wrap: { maxWidth: 820, display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-muted)", margin: 0, lineHeight: 1.5 } satisfies CSSProperties,

  repoList: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  repoCard: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  repoHeader: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  repoName: { fontSize: 13.5, fontWeight: 600 } satisfies CSSProperties,
  installedNote: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  repoActions: { marginLeft: "auto", display: "flex", gap: 8 } satisfies CSSProperties,

  runList: { display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid var(--border)", paddingTop: 10 } satisfies CSSProperties,
  runRow: {
    display: "grid",
    gridTemplateColumns: "60px 100px 60px 1fr",
    alignItems: "center",
    gap: 10,
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
} as const;
