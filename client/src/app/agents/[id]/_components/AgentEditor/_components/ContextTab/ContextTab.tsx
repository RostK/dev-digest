/* Context tab — attach/reorder this agent's OWN Project Context documents
   (SPEC-02 T8). Mirrors the Skills tab's drag+checkbox+filter pattern but
   renders the shared `ContextDocList` (T7) for the row list itself; the
   per-row checkbox is attach/detach ONLY and the "Filter…" box is
   display-only (AC-4 — no per-doc enable, no sub-selection). The discovered
   doc set is always seeded from the ACTIVE repo (NC-2), not a route param. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";
import { ContextDocList, type ContextDocListItem, mergeContextDocs, move } from "@/components/ContextDocList";
import { useActiveRepo } from "@/lib/repo-context";
import { useProjectContextDocs } from "@/lib/hooks/projectContext";
import { useAgentContext, useSetAgentContext } from "@/lib/hooks/agentContext";
import { s } from "./styles";

export function ContextTab({ agentId }: { agentId: string }) {
  const t = useTranslations("agents");
  const { repoId, reposLoaded } = useActiveRepo();
  const { data: docs } = useProjectContextDocs(repoId);
  const { data: attachments } = useAgentContext(agentId);
  const setContext = useSetAgentContext(agentId);

  const [items, setItems] = React.useState<ContextDocListItem[] | null>(null);
  const [selected, setSelected] = React.useState<Set<string> | null>(null);
  const [filter, setFilter] = React.useState("");

  // (Re)build from server data — on agent switch and after each save (the
  // mutation writes the cache, so this reflects the persisted attach set +
  // order).
  React.useEffect(() => {
    if (docs && attachments) {
      const merged = mergeContextDocs(docs, attachments);
      setItems(merged.items);
      setSelected(merged.selected);
    }
  }, [agentId, docs, attachments]);

  if (reposLoaded && !repoId) {
    return (
      <EmptyState icon="Database" title={t("context.noRepo.title")} body={t("context.noRepo.body")} />
    );
  }

  if (!items || !selected) return null;

  if (items.length === 0) {
    return <EmptyState icon="FileText" title={t("context.emptyTitle")} body={t("context.emptyBody")} />;
  }

  const persist = (nextItems: ContextDocListItem[], nextSelected: Set<string>) => {
    setItems(nextItems);
    setSelected(nextSelected);
    const orderedPaths = nextItems.filter((it) => nextSelected.has(it.path)).map((it) => it.path);
    setContext.mutate(orderedPaths);
  };

  const toggle = (path: string) => {
    const next = new Set(selected);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    persist(items, next);
  };

  const onReorder = (from: number, to: number) => {
    persist(move(items, from, to), selected);
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("context.title")}</h2>
      </div>
      <p style={s.hint}>{t("context.orderHint")}</p>

      <ContextDocList
        items={items}
        selected={selected}
        onToggle={toggle}
        onReorder={onReorder}
        filter={filter}
        onFilterChange={setFilter}
      />
    </div>
  );
}
