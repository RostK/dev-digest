/* Route: /multi-agent/runs/:id — the Multi-Agent Review results page
   (SPEC-06 AC-2/AC-8/AC-10/AC-11/AC-12/AC-21/AC-25). Thin route entry; the
   view and its colocated subcomponents/styles/i18n live under
   _components/MultiAgentResultsView. */
"use client";

import { useParams } from "next/navigation";
import { MultiAgentResultsView } from "./_components/MultiAgentResultsView";

export default function MultiAgentRunPage() {
  const { id } = useParams<{ id: string }>();
  return <MultiAgentResultsView runId={id} />;
}
