/* Route: /evals/:agentId — per-agent eval dashboard. Thin route entry: reads
   the agentId from the URL and renders the colocated AgentEvalDashboard. */
"use client";

import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AgentEvalDashboard } from "./_components/AgentEvalDashboard";

export default function AgentEvalsPage() {
  const params = useParams<{ agentId: string }>();

  return (
    <AppShell crumb={[{ label: "Skills Lab" }, { label: "Eval Dashboard", href: "/evals" }, { label: "Agent" }]}>
      <AgentEvalDashboard agentId={params.agentId} />
    </AppShell>
  );
}
