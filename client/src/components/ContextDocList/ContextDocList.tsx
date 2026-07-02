/* ContextDocList — SHARED, reusable row-list for picking project-context docs
   (SPEC-02 T7). Mirrors the Agent Editor Skills tab's drag+checkbox+filter row
   list, generalized for attachable documents: adds a per-doc token count and a
   total-tokens footer that warns past a threshold. Consumed by the Agent
   Editor Context tab (T8) and the Skill editor Context section (T9) to wire
   attach/detach + reorder — kept fully presentational/controlled here so both
   editors can own their own persistence. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, Icon } from "@devdigest/ui";
import type { ContextBadge } from "@devdigest/shared";
import { badgeColor, filterItems, totalTokens } from "./helpers";
import { s } from "./styles";

/** One attachable document row — a trimmed `ProjectContextDoc` (no `used_by`/
    `coverage`: those are Project-Context-screen stats, irrelevant to an
    attach picker). */
export interface ContextDocListItem {
  path: string;
  badge: ContextBadge;
  tokens: number;
}

export interface ContextDocListProps {
  /** Every attachable doc, in DISPLAY order. Order = array position (mirrors
   *  the Skills tab's merged-list pattern: the caller re-sorts `items` after
   *  a reorder, this component never mutates its own copy). */
  items: ContextDocListItem[];
  /** Attached (checked) paths. */
  selected: ReadonlySet<string>;
  onToggle: (path: string) => void;
  /** Fired with the source/target indices within `items` on drag-drop. */
  onReorder: (from: number, to: number) => void;
  filter: string;
  onFilterChange: (value: string) => void;
  /** Total-token warning threshold for the SELECTED set (AC-20). */
  tokenWarningThreshold?: number;
}

/** Conservative default — a sizeable chunk of a typical model context window;
 *  callers (T8/T9) may override per editor. */
const DEFAULT_WARNING_THRESHOLD = 20_000;

export function ContextDocList({
  items,
  selected,
  onToggle,
  onReorder,
  filter,
  onFilterChange,
  tokenWarningThreshold = DEFAULT_WARNING_THRESHOLD,
}: ContextDocListProps) {
  const t = useTranslations("projectContext");
  const dragIndex = React.useRef<number | null>(null);

  const filtering = filter.trim().length > 0;
  const visible = filterItems(items, filter);
  const total = totalTokens(items, selected);
  const overThreshold = total > tokenWarningThreshold;

  const onDrop = (to: number) => {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === to) return;
    onReorder(from, to);
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <Badge color="var(--text-secondary)">
          {t("list.selectedCount", { selected: selected.size, total: items.length })}
        </Badge>
        <div style={s.search}>
          <Icon.Search size={13} style={{ color: "var(--text-muted)" }} />
          <input
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            placeholder={t("list.filterPlaceholder")}
            style={s.searchInput}
          />
        </div>
      </div>

      <div style={s.list} role="list">
        {visible.map((item) => {
          const index = items.indexOf(item);
          const checked = selected.has(item.path);
          return (
            <div
              key={item.path}
              role="listitem"
              style={s.row(checked)}
              draggable={!filtering}
              onDragStart={() => {
                dragIndex.current = index;
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(index)}
            >
              {!filtering && (
                <span style={s.handle} title={t("list.dragHint")} aria-hidden>
                  <Icon.Menu size={14} />
                </span>
              )}
              <Checkbox checked={checked} onChange={() => onToggle(item.path)} />
              <span className="mono" style={s.path} title={item.path}>
                {item.path}
              </span>
              <Badge color={badgeColor(item.badge)}>{t(`badge.${item.badge}`)}</Badge>
              <span className="mono tnum" style={s.tokens}>
                {t("row.tokens", { count: item.tokens })}
              </span>
            </div>
          );
        })}
        {visible.length === 0 && <p style={s.emptyFiltered}>{t("list.empty")}</p>}
      </div>

      <div style={s.footer}>
        <span style={overThreshold ? s.warningTotal : s.total}>
          {t("list.totalTokens", { count: total })}
        </span>
        {overThreshold && (
          <div style={s.warning}>
            <Icon.AlertTriangle size={13} />
            {t("list.warningLine", { count: total })}
          </div>
        )}
      </div>
    </div>
  );
}
