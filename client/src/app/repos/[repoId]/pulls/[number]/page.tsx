import { PrDetailView } from "./_components/PrDetailView";

/* Route: /repos/:repoId/pulls/:number. Thin route entry — the view, its tabs,
   data hooks, trace drawer, styles and i18n are colocated under
   _components/PrDetailView. */
export default function PRDetailPage() {
  return <PrDetailView />;
}
