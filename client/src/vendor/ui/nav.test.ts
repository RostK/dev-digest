import { describe, it, expect } from "vitest";
import { NAV, SHORTCUTS } from "./nav";

describe("nav (T10 — Eval Dashboard)", () => {
  it("registers an Eval Dashboard item under SKILLS LAB linking to /evals with a g-nav shortcut", () => {
    const skillsLab = NAV.find((g) => g.section === "SKILLS LAB")!;
    expect(skillsLab).toBeDefined();

    const item = skillsLab.items.find((i) => i.key === "evals");
    expect(item).toBeDefined();
    expect(item!.label).toBe("Eval Dashboard");
    expect(item!.href).toBe("/evals");
    expect(item!.gKey).toBeTruthy();

    const shortcut = SHORTCUTS.find((s) => s.keys === `g ${item!.gKey}`);
    expect(shortcut).toBeDefined();
    expect(shortcut!.group).toBe("Navigation");
  });
});
