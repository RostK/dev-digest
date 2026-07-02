import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ContextAttachment, ProjectContextDoc, Skill } from "@devdigest/shared";
import { ToastProvider } from "@/lib/toast";
import skillsMessages from "../../../../../../../../../messages/en/skills.json";
import projectContextMessages from "../../../../../../../../../messages/en/projectContext.json";

// Mock the data hooks so the tab renders hermetically (no network/query client).
vi.mock("@/lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    repoId: "repo-1",
    activeRepo: null,
    repos: [],
    reposLoaded: true,
    setRepoId: vi.fn(),
  }),
}));

vi.mock("@/lib/hooks/projectContext", () => ({ useProjectContextDocs: vi.fn() }));
import { useProjectContextDocs } from "@/lib/hooks/projectContext";

vi.mock("@/lib/hooks/skillContext", () => ({
  useSkillContext: vi.fn(),
  useSetSkillContext: vi.fn(),
}));
import { useSkillContext, useSetSkillContext } from "@/lib/hooks/skillContext";

import { ConfigTab } from "./ConfigTab";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "test-quality-rubric",
  description: "Flag tests that only cover the happy path",
  type: "rubric",
  source: "manual",
  body: "# Rule\nCheck test coverage.",
  enabled: true,
  version: 1,
  evidence_files: null,
};

const DOCS: ProjectContextDoc[] = [
  { path: "specs/cross/SPEC-01.md", badge: "specs", tokens: 1200, used_by: 0, coverage: 0 },
  { path: "docs/architecture.md", badge: "docs", tokens: 900, used_by: 0, coverage: 0 },
];

function setDocsHook(docs: ProjectContextDoc[] | undefined) {
  vi.mocked(useProjectContextDocs).mockReturnValue({
    data: docs,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useProjectContextDocs>);
}

function setContextHook(attachment: ContextAttachment[] | undefined, mutate = vi.fn()) {
  vi.mocked(useSkillContext).mockReturnValue({
    data: attachment,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useSkillContext>);
  vi.mocked(useSetSkillContext).mockReturnValue({
    mutate,
    isPending: false,
  } as unknown as ReturnType<typeof useSetSkillContext>);
  return mutate;
}

function renderTab() {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ skills: skillsMessages, projectContext: projectContextMessages }}
    >
      <ToastProvider>
        <ConfigTab skill={SKILL} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("ConfigTab — Project context to use (SPEC-02 T9)", () => {
  it("lists attachable docs, attaches one via checkbox, and persists the ordered paths (AC-6)", () => {
    setDocsHook(DOCS);
    const mutate = setContextHook([]);
    renderTab();

    expect(screen.getByText("Project context to use")).toBeInTheDocument();
    expect(screen.getByText("Any agent using this skill inherits these documents.")).toBeInTheDocument();
    expect(screen.getByText("specs/cross/SPEC-01.md")).toBeInTheDocument();
    expect(screen.getByText("docs/architecture.md")).toBeInTheDocument();

    // Unattached docs render A→Z (see mergeContextItems), so target the row by
    // its path rather than list position, then click that row's checkbox.
    const specRow = screen.getByText("specs/cross/SPEC-01.md").closest('[role="listitem"]');
    fireEvent.click(within(specRow as HTMLElement).getByRole("checkbox"));

    expect(mutate).toHaveBeenCalledWith(["specs/cross/SPEC-01.md"]);
  });

  it("narrows the visible docs via the filter without attaching/detaching anything (AC-4 display-only)", () => {
    setDocsHook(DOCS);
    const mutate = setContextHook(["specs/cross/SPEC-01.md"].map((path) => ({ path, order: 0 })));
    renderTab();

    fireEvent.change(screen.getByPlaceholderText("Filter…"), { target: { value: "arch" } });

    expect(screen.getByText("docs/architecture.md")).toBeInTheDocument();
    expect(screen.queryByText("specs/cross/SPEC-01.md")).not.toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("serializes the preview under the canonical `## Project context` header, never `## Project specifications` (AC-6)", () => {
    setDocsHook(DOCS);
    setContextHook([]);
    renderTab();

    // No docs attached yet: the preview is exactly the bare header.
    expect(screen.getByText("## Project context")).toBeInTheDocument();
    expect(screen.queryByText(/Project specifications/)).not.toBeInTheDocument();

    const [firstCheckbox] = screen.getAllByRole("checkbox");
    fireEvent.click(firstCheckbox!);

    // Attaching a doc keeps the same canonical header as the first line.
    expect(screen.getByText(/^## Project context/)).toBeInTheDocument();
    expect(screen.queryByText(/Project specifications/)).not.toBeInTheDocument();
  });
});
