/* FindingsHoverCard — wraps a trigger (usually a <SeverityIndicators/> cluster)
   and, on hover, shows a card listing the underlying findings: severity icon +
   category + title + file:line. The UI kit has no Popover primitive, so the
   card is portaled to document.body with fixed positioning — that way the PR
   list table's `overflow: hidden` can't clip it. `onOpen` fires once on first
   hover so the PR-list call site can lazily fetch that PR's findings. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { SeverityBadge, CategoryTag } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { s } from "./styles";

export function FindingsHoverCard({
  title,
  findings,
  loading = false,
  emptyLabel,
  onOpen,
  children,
}: {
  /** Card header, e.g. "6 findings" / "2 findings in this run" (i18n'd upstream). */
  title: string;
  /** Open findings to list. `undefined` while a lazy fetch is in flight. */
  findings: FindingRecord[] | undefined;
  loading?: boolean;
  emptyLabel: string;
  /** Fires once, on the first hover — used to trigger a lazy fetch. */
  onOpen?: () => void;
  children: React.ReactNode;
}) {
  const triggerRef = React.useRef<HTMLSpanElement>(null);
  const [coords, setCoords] = React.useState<{ top: number; left: number } | null>(null);
  const fired = React.useRef(false);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const open = () => {
    clearClose();
    const el = triggerRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      setCoords({ top: r.bottom + 6, left: r.left });
    } else {
      setCoords({ top: 0, left: 0 });
    }
    if (!fired.current) {
      fired.current = true;
      onOpen?.();
    }
  };

  // Small grace period so moving the pointer from the trigger across the gap to
  // the (portaled) card doesn't dismiss it.
  const scheduleClose = () => {
    clearClose();
    closeTimer.current = setTimeout(() => setCoords(null), 120);
  };

  React.useEffect(() => clearClose, []);

  return (
    <span
      ref={triggerRef}
      style={s.trigger}
      onMouseEnter={open}
      onMouseLeave={scheduleClose}
    >
      {children}
      {coords !== null &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="dialog"
            aria-label={title}
            style={{ ...s.card, top: coords.top, left: coords.left }}
            onMouseEnter={clearClose}
            onMouseLeave={scheduleClose}
          >
            <div style={s.cardTitle}>{title}</div>
            {loading ? (
              <div style={s.cardMuted}>…</div>
            ) : !findings || findings.length === 0 ? (
              <div style={s.cardMuted}>{emptyLabel}</div>
            ) : (
              <ul style={s.cardList}>
                {findings.map((f) => (
                  <li key={f.id} style={s.cardItem}>
                    <SeverityBadge severity={f.severity} compact />
                    <span style={s.cardItemBody}>
                      <span style={s.cardItemTitle}>{f.title}</span>
                      <span style={s.cardItemMeta}>
                        <CategoryTag category={f.category} />
                        <span className="mono" style={s.cardItemLoc}>
                          {f.file}:{f.start_line}
                        </span>
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>,
          document.body,
        )}
    </span>
  );
}

export default FindingsHoverCard;
