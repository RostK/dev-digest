import type { CSSProperties } from "react";

/** Co-located styles for PreviewTab (mirrors the old SkillPreview body block). */
export const s = {
  wrap: { maxWidth: 820 } satisfies CSSProperties,
  heading: { fontSize: 14, fontWeight: 700, marginBottom: 6 } satisfies CSSProperties,
  note: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "var(--text-muted)",
    marginBottom: 14,
  } satisfies CSSProperties,
  description: {
    fontSize: 13,
    color: "var(--text-secondary)",
    marginBottom: 14,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  bodyText: {
    fontSize: 12.5,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 14,
    margin: 0,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
} as const;
