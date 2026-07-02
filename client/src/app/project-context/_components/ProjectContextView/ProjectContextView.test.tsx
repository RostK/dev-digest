import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ProjectContextDoc } from "@devdigest/shared";
import messages from "../../../../../messages/en/projectContext.json";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    repoId: "repo-1",
    activeRepo: {
      id: "repo-1",
      full_name: "acme/widgets",
      default_branch: "main",
      syncedLabel: "synced",
    },
    repos: [],
    reposLoaded: true,
    setRepoId: vi.fn(),
  }),
}));

vi.mock("@/lib/hooks/projectContext", () => ({ useProjectContextDocs: vi.fn() }));
import { useProjectContextDocs } from "@/lib/hooks/projectContext";

import { ProjectContextView } from "./ProjectContextView";

afterEach(cleanup);

function doc(o: Partial<ProjectContextDoc>): ProjectContextDoc {
  return {
    path: "specs/cross/SPEC-01.md",
    badge: "specs",
    tokens: 1200,
    used_by: 2,
    coverage: 0.5,
    ...o,
  };
}

function setHook(over: Record<string, unknown>) {
  vi.mocked(useProjectContextDocs).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...over,
  } as unknown as ReturnType<typeof useProjectContextDocs>);
}

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ projectContext: messages }}>
      <ProjectContextView />
    </NextIntlClientProvider>,
  );
}

describe("ProjectContextView", () => {
  it("renders each doc's badge and repo-relative path (AC-2)", () => {
    setHook({
      data: [
        doc({ path: "specs/cross/SPEC-01.md", badge: "specs" }),
        doc({ path: "docs/architecture.md", badge: "docs" }),
      ],
    });
    renderView();

    expect(screen.getByText("specs/cross/SPEC-01.md")).toBeInTheDocument();
    expect(screen.getByText("specs")).toBeInTheDocument();
    expect(screen.getByText("docs/architecture.md")).toBeInTheDocument();
    expect(screen.getByText("docs")).toBeInTheDocument();
  });

  it("shows the used-by count and coverage percentage per document (AC-21)", () => {
    setHook({ data: [doc({ used_by: 3, coverage: 0.75 })] });
    renderView();

    expect(screen.getByText("Used by 3 agents")).toBeInTheDocument();
    expect(screen.getByText("75% coverage")).toBeInTheDocument();
  });

  it("renders an empty state when no documents are discovered (AC-3)", () => {
    setHook({ data: [] });
    renderView();

    expect(screen.getByText("No project context documents found")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });
});
