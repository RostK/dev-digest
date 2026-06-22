/* Route: /skills/:id — the Skills Lab shell with this skill selected. Reads the
   id + active ?tab= and hands them to the shared SkillsListView (same component
   that renders /skills); the detail panel shows the 4-tab editor. */
"use client";

import { useParams, useSearchParams } from "next/navigation";
import { SkillsListView } from "../_components/SkillsListView";

export default function SkillDetailPage() {
  const { id } = useParams<{ id: string }>();
  const tab = useSearchParams().get("tab") ?? undefined;
  return <SkillsListView selectedId={id} tab={tab} />;
}
