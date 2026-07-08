/* Route: /multi-agent/configure — the Configure-run page (SPEC-06 AC-3/AC-4).
   Thin route entry; the view, its styles, helpers and i18n are colocated
   under _components/ConfigureRunView. */
"use client";

import { ConfigureRunView } from "./_components/ConfigureRunView";

export default function ConfigureRunPage() {
  return <ConfigureRunView />;
}
