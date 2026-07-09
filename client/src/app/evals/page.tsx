/* Route: /evals — global (workspace-wide) eval dashboard. Thin route entry:
   renders the shell + the colocated GlobalEvalDashboard. */
"use client";

import { AppShell } from "@/components/app-shell";
import { GlobalEvalDashboard } from "./_components/GlobalEvalDashboard";

export default function EvalsPage() {
  return (
    <AppShell crumb={[{ label: "Skills Lab" }, { label: "Eval Dashboard" }]}>
      <GlobalEvalDashboard />
    </AppShell>
  );
}
