/* Route: /multi-agent. No landing page in v1 (multi-run history is per-PR and
   lives on the results page) — redirect straight to the Configure-run page.
   Server component (no "use client"): satisfies AC-18 (the nav item routes to
   a real Multi-Agent Review destination). */
import { redirect } from "next/navigation";

export default function MultiAgentPage() {
  redirect("/multi-agent/configure");
}
