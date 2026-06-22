import { SkillsListView } from "./_components/SkillsListView";

/* Route: /skills — Skills Lab (master-detail). Thin route entry: renders the
   shared shell with no skill selected (empty detail panel). Selecting a skill
   deep-links to /skills/:id?tab=. Everything is colocated under
   _components/SkillsListView. */
export default function SkillsPage() {
  return <SkillsListView />;
}
