/* Skills tab — attach/reorder/enable the workspace's skills on this agent. List
   order = the order skill blocks appear in the assembled review prompt. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, EmptyState, Icon } from "@devdigest/ui";
import { useSkills } from "@/lib/hooks/skills";
import { useAgentSkills, useSetAgentSkills } from "@/lib/hooks/agentSkills";
import { skillTypeColor } from "@/lib/skill-type";
import { mergeBindings, move, type SkillBindingItem } from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agentId }: { agentId: string }) {
  const t = useTranslations("agents");
  const { data: skills } = useSkills();
  const { data: links } = useAgentSkills(agentId);
  const setSkills = useSetAgentSkills(agentId);

  const [items, setItems] = React.useState<SkillBindingItem[] | null>(null);
  const [filter, setFilter] = React.useState("");
  const dragIndex = React.useRef<number | null>(null);

  // (Re)build from server data — on agent switch and after each save (the
  // mutation writes the cache, so this reflects the persisted order + enabled).
  React.useEffect(() => {
    if (skills && links) setItems(mergeBindings(skills, links));
  }, [agentId, skills, links]);

  if (!items) return null;

  if (items.length === 0) {
    return <EmptyState icon="Sparkles" title={t("skills.emptyTitle")} body={t("skills.emptyBody")} />;
  }

  const persist = (next: SkillBindingItem[]) => {
    setItems(next);
    setSkills.mutate(next.map((it) => ({ skill_id: it.skill.id, enabled: it.enabled })));
  };

  const toggle = (id: string) =>
    persist(items.map((it) => (it.skill.id === id ? { ...it, enabled: !it.enabled } : it)));

  const onDrop = (to: number) => {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === to) return;
    persist(move(items, from, to));
  };

  const enabledCount = items.filter((it) => it.enabled).length;
  const q = filter.trim().toLowerCase();
  const filtering = q.length > 0;
  const visible = filtering
    ? items.filter((it) => `${it.skill.name} ${it.skill.description}`.toLowerCase().includes(q))
    : items;

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <Badge color="var(--text-secondary)">
          {t("skills.enabledCount", { linked: enabledCount, total: items.length })}
        </Badge>
        <div style={s.search}>
          <Icon.Search size={13} style={{ color: "var(--text-muted)" }} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("skills.filterPlaceholder")}
            style={s.searchInput}
          />
        </div>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>

      <div style={s.list}>
        {visible.map((it) => {
          const index = items.indexOf(it);
          return (
            <div
              key={it.skill.id}
              style={s.row(it.enabled)}
              draggable={!filtering}
              onDragStart={() => {
                dragIndex.current = index;
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(index)}
            >
              {!filtering && (
                <span style={s.handle} title={t("skills.dragHint")} aria-hidden>
                  <Icon.Menu size={14} />
                </span>
              )}
              <Checkbox checked={it.enabled} onChange={() => toggle(it.skill.id)} />
              <span className="mono" style={s.name}>
                {it.skill.name}
              </span>
              <Badge color={skillTypeColor(it.skill.type)}>{t(`skills.type.${it.skill.type}`)}</Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}
