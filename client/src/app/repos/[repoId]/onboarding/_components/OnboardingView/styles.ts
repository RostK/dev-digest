import type { CSSProperties } from "react";

export const s = {
  page: {
    padding: "24px 32px 60px",
    display: "flex",
    flexDirection: "column",
    gap: 20,
    maxWidth: 1080,
    margin: "0 auto",
  } satisfies CSSProperties,

  centerState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    padding: "60px 24px",
  } satisfies CSSProperties,

  centerStateText: {
    fontSize: 14,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  // ---- header ----
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
  } satisfies CSSProperties,

  headerText: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
  } satisfies CSSProperties,

  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  } satisfies CSSProperties,

  h1: {
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    margin: 0,
    color: "var(--text-primary)",
  } satisfies CSSProperties,

  subtitle: {
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  headerActions: {
    display: "flex",
    gap: 8,
    flexShrink: 0,
  } satisfies CSSProperties,

  modalFooter: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
  } satisfies CSSProperties,

  // ---- layout: left TOC + right content ----
  layout: {
    display: "flex",
    gap: 28,
    alignItems: "flex-start",
  } satisfies CSSProperties,

  toc: {
    width: 200,
    flexShrink: 0,
    position: "sticky",
    top: 20,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,

  tocLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  tocList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,

  tocLink: {
    fontSize: 13,
    color: "var(--text-secondary)",
    textDecoration: "none",
  } satisfies CSSProperties,

  content: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  } satisfies CSSProperties,

  // ---- section card ----
  card: {
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    borderRadius: 10,
    padding: 18,
    scrollMarginTop: 20,
  } satisfies CSSProperties,

  cardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    border: "none",
    background: "transparent",
    padding: 0,
    font: "inherit",
    color: "inherit",
    textAlign: "left",
    cursor: "pointer",
    userSelect: "none",
  } satisfies CSSProperties,

  cardTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: "var(--text-primary)",
  } satisfies CSSProperties,

  linkLabel: {
    fontSize: 13.5,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,

  chevron: (open: boolean): CSSProperties => ({
    color: "var(--text-muted)",
    marginLeft: "auto",
    flexShrink: 0,
    transition: "transform 0.12s",
    transform: open ? "rotate(180deg)" : "none",
  }),

  cardBody: {
    marginTop: 14,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,

  emptyBody: {
    fontSize: 13,
    color: "var(--text-muted)",
    fontStyle: "italic",
  } satisfies CSSProperties,

  // ---- link rows (critical paths / reading path) ----
  linkRow: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "10px 0",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,

  linkRowHead: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,

  linkIndex: {
    fontSize: 12,
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,

  linkPath: {
    fontSize: 13,
    color: "var(--accent-text)",
  } satisfies CSSProperties,

  linkRationale: {
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  } satisfies CSSProperties,

  linkUsedBy: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  // ---- how-to-run steps ----
  stepRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 0",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,

  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: 99,
    background: "var(--bg-hover)",
    display: "grid",
    placeItems: "center",
    fontSize: 11,
    fontWeight: 700,
    color: "var(--text-secondary)",
    flexShrink: 0,
  } satisfies CSSProperties,

  stepCode: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    color: "var(--text-primary)",
    overflowX: "auto",
    whiteSpace: "pre",
  } satisfies CSSProperties,
} as const;
