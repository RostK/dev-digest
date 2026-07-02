/* Route: /repos/:repoId/onboarding (Onboarding Tour, SPEC-03). Thin route
   entry — the view, its sub-components, styles, helpers and i18n are
   colocated under _components/OnboardingView. */
"use client";

import { useParams } from "next/navigation";
import { OnboardingView } from "./_components/OnboardingView";

export default function OnboardingTourPage() {
  const params = useParams<{ repoId: string }>();
  return <OnboardingView repoId={params.repoId} />;
}
