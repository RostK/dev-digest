import type { CSSProperties } from "react";

/** Co-located styles for the shared ContextDocList (mirrors the Agent Editor
 *  Skills tab's row-list styling). T8/T9 render this inside their own
 *  tab/section wrapper, so no outer page padding lives here. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  search: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    width: 200,
  } satisfies CSSProperties,
  searchInput: {
    flex: 1,
    fontSize: 13,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: (checked: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    opacity: checked ? 1 : 0.72,
  }),
  handle: { color: "var(--text-muted)", cursor: "grab", display: "inline-flex" } satisfies CSSProperties,
  path: {
    flex: 1,
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  tokens: {
    fontSize: 12,
    color: "var(--text-muted)",
    minWidth: 64,
    textAlign: "right",
  } satisfies CSSProperties,
  emptyFiltered: { fontSize: 13, color: "var(--text-muted)", padding: "10px 4px" } satisfies CSSProperties,
  footer: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    paddingTop: 8,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  total: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  warningTotal: { fontSize: 12, color: "var(--warn)", fontWeight: 600 } satisfies CSSProperties,
  warning: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "var(--warn)",
    background: "var(--warn-bg)",
    padding: "6px 10px",
    borderRadius: 6,
  } satisfies CSSProperties,
} as const;
