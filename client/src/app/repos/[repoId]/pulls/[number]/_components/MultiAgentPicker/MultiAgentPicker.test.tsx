import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/multiAgentConfig.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({
    data: [
      { id: "a1", name: "Security", model: "gpt-4.1", enabled: true },
      { id: "a2", name: "Performance", model: "gpt-4.1", enabled: true },
    ],
  }),
}));

const mutateAsync = vi.fn().mockResolvedValue({ id: "run-1" });
vi.mock("@/lib/hooks/multiAgent", () => ({
  useAgentEstimates: () => ({
    data: {
      agents: [
        { agent_id: "a1", duration_ms: 4000, cost_usd: 0.05, has_history: true },
        { agent_id: "a2", duration_ms: null, cost_usd: null, has_history: false },
      ],
      summary: { duration_ms: 4000, cost_usd: 0.05, partial: true },
    },
  }),
  useStartMultiRun: () => ({ mutateAsync, isPending: false }),
}));

import { MultiAgentPicker } from "./MultiAgentPicker";

afterEach(() => {
  cleanup();
  mutateAsync.mockClear();
  push.mockClear();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ multiAgentConfig: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("MultiAgentPicker", () => {
  it("lists one checkbox per agent, updates the run count, shows the no-history placeholder (AC-6), Clear empties the selection, and the footer link routes to Configure", () => {
    renderWithIntl(<MultiAgentPicker prId="pr1" />);

    fireEvent.click(screen.getByRole("button", { name: /pick agents to run/i }));

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);

    // AC-1: button label reflects the checked count.
    expect(screen.getByText("Run multi-agent review (0)")).toBeInTheDocument();
    fireEvent.click(checkboxes[0]!);
    expect(screen.getByText("Run multi-agent review (1)")).toBeInTheDocument();

    // AC-6: the agent with no usable history renders the placeholder, never a
    // fabricated number.
    expect(screen.getByText("— · no history")).toBeInTheDocument();

    // Clear empties the selection back to 0.
    fireEvent.click(screen.getByText("Clear"));
    expect(screen.getByText("Run multi-agent review (0)")).toBeInTheDocument();

    // Footer link routes to the Configure-run page.
    fireEvent.click(screen.getByText("Configure agents…"));
    expect(push).toHaveBeenCalledWith("/multi-agent/configure");
  });

  it("disables the run control while a launch is in flight so a double-click fires the start call exactly once (AC-23)", async () => {
    renderWithIntl(<MultiAgentPicker prId="pr1" />);
    fireEvent.click(screen.getByRole("button", { name: /pick agents to run/i }));
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);

    const runButton = screen.getByRole("button", { name: /run multi-agent review \(1\)/i });
    fireEvent.click(runButton);
    fireEvent.click(runButton);

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    // Let the (mocked, instantly-resolved) mutation settle inside act() before
    // the test exits, so the post-launch state update doesn't warn.
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/multi-agent/runs/run-1"));
  });
});
