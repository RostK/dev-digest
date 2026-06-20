import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import { ConventionCard } from "./ConventionCard";

afterEach(cleanup);

const C: ConventionCandidate = {
  id: "c1",
  category: "async",
  rule: "Always use async/await instead of .then() chains",
  evidence_path: "src/api/users.ts",
  evidence_snippet: "const user = await db.users.find(id);",
  evidence_start_line: 23,
  evidence_end_line: 31,
  confidence: 0.91,
  accepted: false,
};

function renderCard(c: ConventionCandidate, onAccept = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionCard
        convention={c}
        repoFullName="acme/payments"
        defaultBranch="main"
        onAccept={onAccept}
      />
    </NextIntlClientProvider>,
  );
  return onAccept;
}

describe("ConventionCard", () => {
  it("renders the rule, confidence and a GitHub deep-link to the exact lines", () => {
    renderCard(C);
    expect(screen.getByText(C.rule)).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "https://github.com/acme/payments/blob/main/src/api/users.ts#L23-L31",
    );
  });

  it("calls onAccept(true) / onAccept(false) on Accept / Reject", () => {
    const onAccept = renderCard(C);
    fireEvent.click(screen.getByRole("button", { name: /accept/i }));
    expect(onAccept).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: /reject/i }));
    expect(onAccept).toHaveBeenCalledWith(false);
  });

  it("shows the Accepted state when accepted", () => {
    renderCard({ ...C, accepted: true });
    expect(screen.getByRole("button", { name: /accepted/i })).toBeInTheDocument();
  });
});
