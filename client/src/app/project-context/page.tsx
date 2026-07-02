/* Route: /project-context (Project Context screen, SPEC-02). Thin route
   entry — the view, its styles, helpers and i18n are colocated under
   _components/ProjectContextView. */
"use client";

import { ProjectContextView } from "./_components/ProjectContextView";

export default function ProjectContextPage() {
  return <ProjectContextView />;
}
