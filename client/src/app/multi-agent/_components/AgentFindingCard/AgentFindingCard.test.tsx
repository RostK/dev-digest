import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../messages/en/multiAgentFindings.json";
import { ToastProvider } from "@/lib/toast";

// `useFindingAction` is the EXISTING hook (client/src/lib/hooks/reviews.ts) —
// reused unchanged (AC-14). Mocked here per client/INSIGHTS.md: mutate's
// per-call `onSuccess` is invoked synchronously so the card can reflect the
// finding's new accepted/dismissed state without a real query cache.
const { mutateMock } = vi.hoisted(() => ({ mutateMock: vi.fn() }));
vi.mock("@/lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: mutateMock, isPending: false }),
}));

import { AgentFindingCard } from "./AgentFindingCard";

afterEach(cleanup);

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

const writeTextMock = vi.fn().mockResolvedValue(undefined);
const fetchMock = vi.fn();

beforeEach(() => {
  mutateMock.mockReset();
  mutateMock.mockImplementation(
    (
      vars: { findingId: string; action: "accept" | "dismiss"; prId?: string },
      opts?: { onSuccess?: (data: { finding: Partial<FindingRecord> }) => void },
    ) => {
      opts?.onSuccess?.({
        finding: {
          accepted_at: vars.action === "accept" ? "2026-07-08T00:00:00Z" : null,
          dismissed_at: vars.action === "dismiss" ? "2026-07-08T00:00:00Z" : null,
        },
      });
    },
  );
  writeTextMock.mockClear();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: writeTextMock },
    configurable: true,
  });
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ multiAgentFindings: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("AgentFindingCard", () => {
  it("expands to show confidence, rationale, suggested fix, and 5 action buttons with Learn/Reply disabled (AC-13)", () => {
    renderWithProviders(<AgentFindingCard finding={FINDING} prId="pr1" defaultExpanded />);

    // Collapsed-visible info.
    expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
    expect(screen.getByText("src/config.ts:11")).toBeInTheDocument();
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.getByText(/95% conf/)).toBeInTheDocument();

    // Expanded content.
    expect(screen.getByText(/Stripe key is committed in source\./)).toBeInTheDocument();
    expect(screen.getByText("Suggested fix")).toBeInTheDocument();
    expect(screen.getByText("Move the key to an environment variable.")).toBeInTheDocument();

    // Five action buttons.
    expect(screen.getByRole("button", { name: "Accept" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Turn into eval case" })).toBeEnabled();
    const learnBtn = screen.getByRole("button", { name: "Learn" });
    const replyBtn = screen.getByRole("button", { name: "Reply to author" });
    expect(learnBtn).toBeDisabled();
    expect(replyBtn).toBeDisabled();
    // Accessible "coming soon" tooltip, exposed even though the buttons are disabled.
    expect(learnBtn).toHaveAccessibleDescription(/coming soon/i);
    expect(replyBtn).toHaveAccessibleDescription(/coming soon/i);
  });

  it("fires Accept/Dismiss via useFindingAction and reflects the finding's new state (AC-14)", () => {
    renderWithProviders(<AgentFindingCard finding={FINDING} prId="pr1" defaultExpanded />);

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(mutateMock).toHaveBeenLastCalledWith(
      { findingId: "f1", action: "accept", prId: "pr1" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(screen.getByText("accepted")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(mutateMock).toHaveBeenLastCalledWith(
      { findingId: "f1", action: "dismiss", prId: "pr1" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(screen.getByText("dismissed")).toBeInTheDocument();
  });

  it("Turn into eval case copies an AgentCase-shaped template to the clipboard, confirms, and calls no route (AC-24)", async () => {
    renderWithProviders(
      <AgentFindingCard
        finding={FINDING}
        agentName="Security Reviewer"
        prId="pr1"
        defaultExpanded
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));

    expect(await screen.findByText(/copied to clipboard/i)).toBeInTheDocument();
    expect(writeTextMock).toHaveBeenCalledTimes(1);
    const copied = writeTextMock.mock.calls[0]?.[0] as string;
    expect(copied).toContain("kind: 'quality'");
    expect(copied).toContain("Hardcoded Stripe secret key");
    expect(copied).toContain("threshold: 1.0");
    expect(copied).toContain("maxTurns: 25");
    // Client-only clipboard copy — no server call (AC-24).
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
