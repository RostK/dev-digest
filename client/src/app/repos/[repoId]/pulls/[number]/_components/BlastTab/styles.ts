import type { CSSProperties } from "react";

export const s = {
  /** Bordered elevated card, mirroring IntentCard so the two sit as a pair.
   *  Fixed height with the body scrolling inside (header stays put). */
  card: {
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    borderRadius: 10,
    padding: 18,
    height: "min(560px, 72vh)",
    display: "flex",
    flexDirection: "column",
  } satisfies CSSProperties,

  /** Scrollable body below the fixed section header. */
  scroll: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    paddingRight: 4,
  } satisfies CSSProperties,

  statRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 14,
  } satisfies CSSProperties,

  degradedBanner: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
    marginBottom: 14,
  } satisfies CSSProperties,

  degradedText: {
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  } satisfies CSSProperties,

  // ---- summary (short by default, click to expand) ----
  summaryLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    display: "flex",
    alignItems: "center",
    gap: 5,
    marginBottom: 4,
  } satisfies CSSProperties,

  summaryText: (expanded: boolean): CSSProperties => ({
    fontSize: 13,
    fontStyle: "italic",
    color: "var(--text-secondary)",
    lineHeight: 1.5,
    margin: "0 0 14px",
    cursor: "pointer",
    ...(expanded
      ? {}
      : ({
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        } as CSSProperties)),
  }),

  // ---- symbol tree (compact, no per-symbol box) ----
  symbolRow: {
    paddingTop: 2,
    paddingBottom: 2,
  } satisfies CSSProperties,

  symbolHeader: (open: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
    userSelect: "none",
    padding: "5px 8px",
    borderRadius: 6,
    background: open ? "var(--bg-hover)" : "transparent",
  }),

  chevron: (open: boolean): CSSProperties => ({
    color: "var(--text-muted)",
    flexShrink: 0,
    transition: "transform 0.12s",
    transform: open ? "rotate(90deg)" : "none",
  }),

  symbolName: {
    fontSize: 13.5,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,

  symbolKind: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  callerList: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
    marginLeft: 7,
    paddingLeft: 14,
    paddingTop: 4,
    paddingBottom: 2,
    borderLeft: "1px solid var(--border)",
  } satisfies CSSProperties,

  callerRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 6,
    minWidth: 0,
  } satisfies CSSProperties,

  callerArrow: {
    color: "var(--text-muted)",
    flexShrink: 0,
    fontSize: 12,
  } satisfies CSSProperties,

  /** Anchor that truncates the directory prefix but keeps filename:line visible. */
  callerLink: {
    display: "flex",
    minWidth: 0,
    alignItems: "baseline",
    textDecoration: "none",
    fontSize: 12.5,
  } satisfies CSSProperties,

  callerDir: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  callerBase: {
    flexShrink: 0,
    color: "var(--accent-text)",
  } satisfies CSSProperties,

  callerName: {
    fontSize: 12,
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,

  noCallers: {
    fontSize: 12,
    color: "var(--text-muted)",
    fontStyle: "italic",
    marginLeft: 7,
    paddingLeft: 14,
    paddingTop: 2,
  } satisfies CSSProperties,

  badges: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    marginTop: 8,
    marginLeft: 7,
    paddingLeft: 14,
  } satisfies CSSProperties,

  // ---- unaffected (zero-caller) symbols ----
  unaffectedToggle: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    cursor: "pointer",
    userSelect: "none",
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "8px 0 2px",
    marginTop: 6,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,

  unaffectedList: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    paddingTop: 8,
  } satisfies CSSProperties,

  unaffectedChip: {
    fontSize: 12,
    color: "var(--text-secondary)",
    background: "var(--bg-hover)",
    border: "1px solid var(--border)",
    borderRadius: 5,
    padding: "1px 7px",
  } satisfies CSSProperties,

  loading: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
} as const;
