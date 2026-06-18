import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
// The hover-card findings list is fetched lazily; the cluster itself comes from
// pr.findings, so the smoke tests don't need any review data.
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: undefined, isLoading: false }),
}));

import { PRRow } from "./PRRow";

afterEach(cleanup);

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr-1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rate-limit",
    base: "main",
    head_sha: "abc1234",
    additions: 247,
    deletions: 18,
    files_count: 6,
    status: "needs_review",
    opened_at: "2026-06-11T18:44:34.000Z",
    updated_at: "2026-06-11T18:44:34.000Z",
    score: 61,
    cost_usd: 0.014,
    findings: null,
    ...o,
  };
}

function renderRow(meta: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={meta} repoId="r1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — findings column", () => {
  it("renders a severity cluster from pr.findings (zero severities hidden)", () => {
    renderRow(pr({ findings: { critical: 2, warning: 1, suggestion: 0 } }));
    expect(screen.getByTitle("2 Critical")).toBeInTheDocument();
    expect(screen.getByTitle("1 Warning")).toBeInTheDocument();
    expect(screen.queryByTitle(/Suggestion/)).not.toBeInTheDocument();
  });

  it("renders no cluster for an unreviewed PR (findings null)", () => {
    renderRow(pr({ findings: null, score: null }));
    expect(screen.queryByTitle(/Critical|Warning|Suggestion/)).not.toBeInTheDocument();
  });
});
