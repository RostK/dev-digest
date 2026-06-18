import { describe, it, expect } from "vitest";
import type { ReviewRecord, FindingRecord } from "@devdigest/shared";
import { latestReviewsPerAgent, openFindings } from "./helpers";

function review(o: Partial<ReviewRecord> & { id: string }): ReviewRecord {
  return {
    pr_id: "pr1",
    agent_id: null,
    run_id: null,
    agent_name: null,
    kind: "review",
    verdict: null,
    summary: null,
    score: null,
    model: null,
    created_at: "2026-06-16T00:00:00.000Z",
    findings: [],
    ...o,
  };
}
function finding(id: string, sev: FindingRecord["severity"]): FindingRecord {
  return {
    id,
    severity: sev,
    category: "bug",
    title: id,
    file: "a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "x",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r",
    accepted_at: null,
    dismissed_at: null,
  };
}

describe("latestReviewsPerAgent", () => {
  it("keeps the newest review per agent and drops superseded passes", () => {
    const a = "agent-a", b = "agent-b";
    const reviews = [
      review({ id: "a-old", agent_id: a, created_at: "2026-06-16T10:00:00.000Z", findings: [finding("f1", "CRITICAL")] }),
      review({ id: "a-new", agent_id: a, created_at: "2026-06-16T12:00:00.000Z", findings: [] }),
      review({ id: "b-only", agent_id: b, created_at: "2026-06-16T11:00:00.000Z", findings: [finding("f2", "WARNING")] }),
    ];
    const latest = latestReviewsPerAgent(reviews);
    expect(latest.map((r) => r.id).sort()).toEqual(["a-new", "b-only"]);
    // agent-a's stale critical is gone; only agent-b's warning survives.
    expect(openFindings(latest.flatMap((r) => r.findings)).map((f) => f.severity)).toEqual(["WARNING"]);
  });

  it("collapses all null-agent reviews into one bucket (latest wins)", () => {
    const reviews = [
      review({ id: "n-old", agent_id: null, created_at: "2026-06-16T10:00:00.000Z", findings: [finding("f1", "CRITICAL")] }),
      review({ id: "n-new", agent_id: null, created_at: "2026-06-16T12:00:00.000Z", findings: [finding("f2", "SUGGESTION")] }),
    ];
    expect(latestReviewsPerAgent(reviews).map((r) => r.id)).toEqual(["n-new"]);
  });

  it("ignores non-review (summary) rows", () => {
    const reviews = [
      review({ id: "sum", kind: "summary", agent_id: "a", created_at: "2026-06-16T13:00:00.000Z" }),
      review({ id: "rev", kind: "review", agent_id: "a", created_at: "2026-06-16T12:00:00.000Z", findings: [finding("f1", "CRITICAL")] }),
    ];
    // The newer summary must NOT supersede the review and suppress its findings.
    const latest = latestReviewsPerAgent(reviews);
    expect(latest.map((r) => r.id)).toEqual(["rev"]);
  });
});
