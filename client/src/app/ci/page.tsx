import { CiRunsView } from "./_components/CiRunsView";

/* Route: /ci — global CI Runs page (AC-18). Thin route entry: renders the
   colocated view over `useCiRuns`. */
export default function CiRunsPage() {
  return <CiRunsView />;
}
