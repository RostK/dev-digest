import type { CSSProperties } from "react";

/** Co-located styles for SmartDiffViewer using CSS design tokens. */
export const s = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: 24,
  } satisfies CSSProperties,

  /** Banner shown when split_suggestion.too_big is true. */
  banner: {
    border: "1px solid var(--warn-border, var(--border))",
    borderRadius: 8,
    background: "var(--warn-bg, var(--bg-elevated))",
    padding: "12px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,

  bannerTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--warn, var(--text-primary))",
  } satisfies CSSProperties,

  bannerBody: {
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  bannerSplits: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    paddingLeft: 16,
    marginTop: 4,
  } satisfies CSSProperties,

  bannerSplitItem: {
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  bannerSplitFiles: {
    fontSize: 12,
    color: "var(--text-muted)",
    marginLeft: 8,
  } satisfies CSSProperties,

  /** One role group (Core / Wiring / Boilerplate). */
  group: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,

  groupHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    cursor: "pointer",
    userSelect: "none",
    padding: "6px 0",
    borderBottom: "1px solid var(--border)",
    marginBottom: 4,
  } satisfies CSSProperties,

  groupTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--text-primary)",
    letterSpacing: "0.01em",
  } satisfies CSSProperties,

  groupDesc: {
    fontSize: 12,
    color: "var(--text-muted)",
    flex: 1,
  } satisfies CSSProperties,

  groupCount: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  groupChevron: {
    color: "var(--text-muted)",
    transition: "transform .12s",
    flexShrink: 0,
  } satisfies CSSProperties,

  fileList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
} as const;
