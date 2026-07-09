import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import evalsMessages from "../../../../../../../../messages/en/evals.json";
import { FindingCard } from "./FindingCard";

const mutateMock = vi.fn();
vi.mock("@/lib/hooks/evals", () => ({
  useCreateEvalFromFinding: () => ({ mutate: mutateMock, isPending: false, isSuccess: false }),
}));
vi.mock("@/lib/toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), toast: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  mutateMock.mockClear();
});

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "A **live** Stripe key is committed in source.",
  suggestion: "Move the key to an environment variable.",
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ prReview: messages, evals: evalsMessages }}
    >
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingCard (smoke, both themes)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`renders severity + file:line + rationale in ${theme}`, () => {
      renderWithIntl(
        <div data-theme={theme}>
          <FindingCard f={FINDING} defaultExpanded onAction={() => {}} />
        </div>,
      );
      expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
      expect(screen.getByText("src/config.ts:11")).toBeInTheDocument();
      // category label is shown alongside the severity badge
      expect(screen.getByText("security")).toBeInTheDocument();
    });
  });

  it("fires accept/dismiss actions", () => {
    const onAction = vi.fn();
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={onAction} />);
    fireEvent.click(screen.getByText("Accept"));
    expect(onAction).toHaveBeenCalledWith("accept");
    fireEvent.click(screen.getByText("Dismiss"));
    expect(onAction).toHaveBeenCalledWith("dismiss");
  });
});

describe("FindingCard — Turn into eval case (AC-12)", () => {
  it("shows the action on an ACCEPTED finding and posts the finding id on click", () => {
    const accepted: FindingRecord = { ...FINDING, accepted_at: "2026-07-01T00:00:00Z" };
    renderWithIntl(<FindingCard f={accepted} defaultExpanded onAction={() => {}} />);

    const btn = screen.getByText("Turn into eval case");
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(mutateMock).toHaveBeenCalledWith(
      { findingId: "f1" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("shows the action on a DISMISSED finding and posts the finding id on click", () => {
    const dismissed: FindingRecord = { ...FINDING, dismissed_at: "2026-07-01T00:00:00Z" };
    renderWithIntl(<FindingCard f={dismissed} defaultExpanded onAction={() => {}} />);

    const btn = screen.getByText("Turn into eval case");
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(mutateMock).toHaveBeenCalledWith(
      { findingId: "f1" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("does NOT show the action on an OPEN (un-acted) finding", () => {
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={() => {}} />);
    expect(screen.queryByText("Turn into eval case")).not.toBeInTheDocument();
  });
});
