import { describe, it, expect } from "vitest";
import { NAV, SHORTCUTS, resolveHref } from "./nav";
import { activeKeyFor } from "@/components/app-shell/helpers";

describe("nav — Multi-Agent Review (AC-18)", () => {
  it("adds a GLOBAL section with the Multi-Agent Review item routing to /multi-agent", () => {
    const global = NAV.find((g) => g.section === "GLOBAL");
    expect(global).toBeDefined();

    const item = global?.items.find((i) => i.key === "multi-agent");
    expect(item).toBeDefined();
    expect(item?.label).toBe("Multi-Agent Review");
    expect(item?.href).toBe("/multi-agent");
    expect(resolveHref(item!.href, "some-repo")).toBe("/multi-agent");
  });

  it("registers a matching g-shortcut", () => {
    const item = NAV.flatMap((g) => g.items).find((i) => i.key === "multi-agent");
    expect(SHORTCUTS.some((s) => s.keys === `g ${item?.gKey}`)).toBe(true);
  });

  it("is the active sidebar key on any /multi-agent route", () => {
    expect(activeKeyFor("/multi-agent")).toBe("multi-agent");
    expect(activeKeyFor("/multi-agent/configure")).toBe("multi-agent");
    expect(activeKeyFor("/multi-agent/runs/abc")).toBe("multi-agent");
  });
});

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
