import type { AgentCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

const REVIEW_PROMPT = `Audit this diff against DevDigest's documented structural contracts.

${fx("checkout-service.diff")}`;

// A second real diff whose violations map onto DevDigest-SPECIFIC documented invariants — the
// reviewer-core "no I/O except the injected LLMProvider" purity rule (reviewer-core/CLAUDE.md,
// README) and the mandatory `groundFindings()` gate — which a competent model will describe in
// prose but will not tie to the NAMED documented invariant unless the agent forces a citation.
// This is the discriminating case for the strict-vs-lite A/B: both variants should FIND both
// problems, but only the strict variant (which keeps the "cite the exact documented rule per
// finding" hard rule) should reliably name the invariant. The checkout diff's textbook violations
// don't discriminate — the model ties them to the inward-dependency / DI rules either way.
const REVIEWER_CORE_PROMPT = `Audit this diff against DevDigest's documented structural contracts.

${fx("reviewer-core-gate.diff")}`;

// A diff that violates NO documented rule (a pure local-variable rename inside a domain file, no
// new imports, no cross-layer edges). A grounded reviewer should report zero violations. This
// surfaces the COST of relaxing the citation rule: freed from "every finding must name a
// documented contract", the lite variant is more prone to fabricating a judgment/best-practice
// finding where the strict variant stays silent.
const BENIGN_PROMPT = `Audit this diff against DevDigest's documented structural contracts.

${fx("benign-refactor.diff")}`;

// Shared across the strict (architecture-reviewer) and relaxed (architecture-reviewer-lite)
// variants so the two agents are graded on the exact same task — the only thing that should
// move between the two runs is whether "cites the specific documented rule" keeps passing.
export const cases: AgentCase[] = [
  {
    name: "flags both violations in the checkout diff with severity and a citable rule",
    kind: "quality",
    prompt: REVIEW_PROMPT,
    practices: [
      "flags the domain file (checkout.ts) importing a type from 'fastify' as a violation of the inward-only dependency rule between Domain and Presentation layers",
      "flags the `new PgCheckoutRepository()` call inside service.ts as a violation of DI discipline (concrete adapters/repositories must be constructed only in the composition root / container)",
      "names the documented invariant each finding breaks — the inward dependency rule for the fastify import, and the Container-as-sole-composition-root / DI rule for the `new PgCheckoutRepository()` call — rather than describing the problem only generically",
      "assigns each finding a severity tier from the agent's rubric (VIOLATION / SMELL / NIT)",
      "quotes the offending line verbatim as evidence for each finding, not a paraphrase",
      "ends with an explicit overall recommendation (Block / Discuss / Approve); Block when any VIOLATION exists",
    ],
    threshold: 0.8,
    maxTurns: 25,
  },
  {
    name: "does not fabricate an architecture finding for the out-of-scope security-shaped change",
    kind: "quality",
    prompt: REVIEW_PROMPT,
    practices: [
      "does not invent an architecture-contract violation for the optional `reply?: FastifyReply` parameter beyond the inward dependency import issue itself (no runtime bug/security finding fabricated as an architecture rule)",
      "stays scoped to structural/layering/DI findings and does not comment on naming, style, or test coverage",
    ],
    threshold: 0.8,
    maxTurns: 25,
  },
  {
    name: "cites the DevDigest-specific rule identifier for reviewer-core violations",
    kind: "quality",
    prompt: REVIEWER_CORE_PROMPT,
    practices: [
      "flags the `import { readFileSync } from 'node:fs'` added to reviewer-core/src/pipeline/run.ts as a violation (reviewer-core must do no I/O except the injected LLMProvider)",
      "flags that runPipeline now returns `deduped` directly, skipping the mandatory `groundFindings()` gate before emitting findings",
      "names the documented reviewer-core purity invariant — no DB/GitHub/filesystem I/O, only the injected LLMProvider — as the rule the `node:fs` import breaks, not just a generic 'does I/O' remark",
      "identifies that the change skips the documented mandatory `groundFindings()` citation gate in the diff → prompt → LLM → groundFindings → Review pipeline",
      "quotes the offending line verbatim as evidence for each finding, not a paraphrase",
      "ends with an explicit overall recommendation (Block / Discuss / Approve); Block when any VIOLATION exists",
    ],
    threshold: 0.8,
    maxTurns: 25,
  },
  {
    name: "does not fabricate a documented-rule violation for a benign rename",
    kind: "quality",
    prompt: BENIGN_PROMPT,
    practices: [
      "reports no VIOLATION for the benign rename (at most a NIT/SMELL non-blocking observation) — it does not invent a blocking structural finding",
      "does not fabricate a documented-rule violation where the diff violates none of the checked rules",
      "the final recommendation is Approve (no VIOLATION found)",
    ],
    threshold: 0.8,
    maxTurns: 25,
  },
];
