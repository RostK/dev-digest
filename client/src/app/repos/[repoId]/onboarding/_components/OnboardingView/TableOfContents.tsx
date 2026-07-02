/* TableOfContents — left "ON THIS PAGE" anchor nav (AC-3), one link per
   rendered section card, keyboard-navigable native <a href="#..."> anchors
   (AC-20). */
"use client";

import { useTranslations } from "next-intl";
import { s } from "./styles";
import type { OrderedSection } from "./helpers";

export function TableOfContents({ sections }: { sections: OrderedSection[] }) {
  const t = useTranslations("onboarding");
  return (
    <nav aria-label={t("onThisPage")} style={s.toc}>
      <div style={s.tocLabel}>{t("onThisPage")}</div>
      <ul style={s.tocList}>
        {sections.map(({ def, section }) => (
          <li key={def.kind}>
            <a href={`#${def.id}`} style={s.tocLink}>
              {section.title || t(def.titleKey)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
