/* FindingsHoverCard — wraps a trigger (usually a <SeverityIndicators/> cluster)
   and, on hover, shows a card listing the underlying findings: severity icon +
   category + title + file:line. The UI kit has no Popover primitive, so the
   card is portaled to document.body with fixed positioning — that way the PR
   list table's `overflow: hidden` can't clip it. `onOpen` fires once on first
   hover so the PR-list call site can lazily fetch that PR's findings.

   The list is capped at `max` (newest first — callers pass findings ordered by
   most-recent review) with a "+N more" footer, so a noisy PR doesn't render a
   wall of items. Placement is viewport-aware: it opens below the trigger but
   flips above (and clamps horizontally) when there isn't room, so the card
   isn't clipped at the bottom/right edge for rows low in the list. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { SeverityBadge, CategoryTag } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { s } from "./styles";

const GAP = 6; // px between the trigger and the card
const MARGIN = 8; // px min distance the card keeps from the viewport edges

export function FindingsHoverCard({
  title,
  findings,
  loading = false,
  emptyLabel,
  onOpen,
  max = 5,
  moreLabel,
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
  /** Max findings to list before collapsing the rest into the footer (default 5). */
  max?: number;
  /** Footer text for the `N` hidden findings, e.g. `(n) => "+3 more"` (i18n'd upstream). */
  moreLabel?: (count: number) => string;
  children: React.ReactNode;
}) {
  const triggerRef = React.useRef<HTMLSpanElement>(null);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const fired = React.useRef(false);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  // Measure the trigger + the (already-rendered) card and pick a placement that
  // stays inside the viewport: below by default, flipped above when below would
  // overflow and there's more room up top; left clamped to the right edge.
  const place = React.useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === "undefined") return;
    const r = trigger.getBoundingClientRect();
    const card = cardRef.current;
    const cw = card?.offsetWidth || 320;
    const ch = card?.offsetHeight || 320;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = Math.min(r.left, vw - cw - MARGIN);
    left = Math.max(MARGIN, left);

    let top = r.bottom + GAP;
    if (top + ch > vh - MARGIN) {
      const above = r.top - GAP - ch;
      top = above >= MARGIN ? above : Math.max(MARGIN, vh - ch - MARGIN);
    }
    setPos({ top, left });
  }, []);

  const openCard = () => {
    clearClose();
    setOpen(true);
    if (!fired.current) {
      fired.current = true;
      onOpen?.();
    }
  };

  // Small grace period so moving the pointer from the trigger across the gap to
  // the (portaled) card doesn't dismiss it.
  const scheduleClose = () => {
    clearClose();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  React.useEffect(() => clearClose, []);

  // Position once the card has mounted (so we can measure it) and re-position
  // whenever its content size changes (lazy load) or the page scrolls/resizes.
  // Runs before paint, so there's no flash at the pre-measured position.
  React.useLayoutEffect(() => {
    if (!open) return;
    place();
    const onMove = () => place();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, loading, findings?.length, place]);

  const shown = findings ? findings.slice(0, max) : undefined;
  const hidden = findings ? findings.length - (shown?.length ?? 0) : 0;

  return (
    <span
      ref={triggerRef}
      style={s.trigger}
      onMouseEnter={openCard}
      onMouseLeave={scheduleClose}
    >
      {children}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={cardRef}
            role="dialog"
            aria-label={title}
            style={{ ...s.card, top: pos.top, left: pos.left }}
            onMouseEnter={clearClose}
            onMouseLeave={scheduleClose}
          >
            <div style={s.cardTitle}>{title}</div>
            {loading ? (
              <div style={s.cardMuted}>…</div>
            ) : !shown || shown.length === 0 ? (
              <div style={s.cardMuted}>{emptyLabel}</div>
            ) : (
              <>
                <ul style={s.cardList}>
                  {shown.map((f) => (
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
                {hidden > 0 && moreLabel ? (
                  <div style={s.cardMore}>{moreLabel(hidden)}</div>
                ) : null}
              </>
            )}
          </div>,
          document.body,
        )}
    </span>
  );
}

export default FindingsHoverCard;
