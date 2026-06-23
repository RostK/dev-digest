import type { CSSProperties } from "react";

/** Co-located styles for the Skills Lab shell (left list + right detail).
 *  Mirrors the /agents/:id master-detail layout. */
export const s = {
  // 52px = AppFrame top bar; fill the rest so each panel scrolls independently.
  wrap: { display: "flex", height: "calc(100vh - 52px)" } satisfies CSSProperties,

  // ---- left: skills list ----
  left: {
    width: 320,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  leftHead: { padding: "16px 16px 12px" } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 } satisfies CSSProperties,
  h1: { fontSize: 18, fontWeight: 700, flex: 1, letterSpacing: "-0.02em" } satisfies CSSProperties,
  search: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  searchIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  searchInput: {
    flex: 1,
    fontSize: 13,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  listScroll: { flex: 1, overflow: "auto", padding: "4px 12px 12px" } satisfies CSSProperties,
  listSkeletons: { display: "flex", flexDirection: "column", gap: 10, padding: 4 } satisfies CSSProperties,

  // ---- right: detail ----
  right: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    minHeight: 0,
  } satisfies CSSProperties,
} as const;
