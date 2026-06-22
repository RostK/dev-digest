import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import { CreateSkillFromConventionsModal } from "./CreateSkillFromConventionsModal";

const mutateAsync = vi.fn().mockResolvedValue({ id: "sk1" });
vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutateAsync, isPending: false }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(() => {
  cleanup();
  mutateAsync.mockClear();
});

const ITEMS: ConventionCandidate[] = [
  {
    id: "c1",
    category: "async",
    rule: "Use async/await",
    evidence_path: "src/a.ts",
    evidence_snippet: "await x()",
    evidence_start_line: 1,
    evidence_end_line: 1,
    confidence: 0.9,
    accepted: true,
  },
];

describe("CreateSkillFromConventionsModal", () => {
  it("creates a GLOBAL extracted convention skill (no repo_id pin)", async () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
        <CreateSkillFromConventionsModal
          repoFullName="acme/payments"
          items={ITEMS}
          onClose={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /create skill/i }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const arg = mutateAsync.mock.calls[0]![0];
    expect(arg).toMatchObject({ source: "extracted", type: "convention" });
    expect(arg.repo_id).toBeUndefined();
    expect(arg.evidence_files).toContain("src/a.ts");
  });
});
