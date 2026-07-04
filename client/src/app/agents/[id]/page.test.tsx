import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import type { Agent } from "@devdigest/shared";

// Drive the ?tab= value per test.
let searchStr = "";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "ag1" }),
  useSearchParams: () => new URLSearchParams(searchStr),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const AGENT: Agent = {
  id: "ag1",
  name: "General Reviewer",
  description: "Reviews a PR diff for bugs.",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({ data: [] }),
  useAgent: () => ({ data: AGENT, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useUpdateAgent: () => ({ mutate: vi.fn() }),
}));

// Echo the `tab` prop the PAGE resolves from ?tab= — isolates the URL→tab
// routing (the bug) from the editor's internals. The real
// AgentEditor/constants TABS still backs the page's VALID_TABS derivation.
vi.mock("./_components/AgentEditor", () => ({
  AgentEditor: ({ tab }: { tab: string }) => <div data-testid="editor-tab">{tab}</div>,
}));

import AgentEditorPage from "./page";

afterEach(cleanup);

describe("Agent editor page — ?tab= routing", () => {
  it("routes ?tab=context to the Context tab (regression: VALID_TABS must include EVERY editor tab)", () => {
    searchStr = "tab=context";
    render(<AgentEditorPage />);
    expect(screen.getByTestId("editor-tab")).toHaveTextContent("context");
  });

  it("routes ?tab=skills to the Skills tab", () => {
    searchStr = "tab=skills";
    render(<AgentEditorPage />);
    expect(screen.getByTestId("editor-tab")).toHaveTextContent("skills");
  });

  it("falls back to config for an unknown/absent tab", () => {
    searchStr = "tab=bogus";
    render(<AgentEditorPage />);
    expect(screen.getByTestId("editor-tab")).toHaveTextContent("config");
  });
});
