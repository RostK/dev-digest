import type { ConventionCandidate } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { getFeatureModelOverride } from '../settings/feature-models.js';
import { ConventionsRepository, type InsertConvention } from './repository.js';
import {
  ConventionExtraction,
  buildExtractionMessages,
  locateSnippet,
  normalizeEvidencePath,
  toConventionDto,
  type Sample,
} from './helpers.js';
import { CONFIG_FILENAMES, CONVENTIONS_DEFAULT_MODEL, SAMPLE_FILE_COUNT } from './constants.js';

/**
 * Conventions extractor. Orchestrates:
 *   sample (configs + top-ranked source files — pure code, no model)
 *     → cheap LLM (propose {rule, category, evidence})
 *     → GROUND each proposal against the real file (drop the ungrounded)
 *     → persist as candidates (accepted=false), replacing the prior scan.
 *
 * Accepted candidates become reusable Skills via the existing `POST /skills`
 * (client-assembled body) — this service never writes skills itself.
 */
export class ConventionsService {
  private repo: ConventionsRepository;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    const rows = await this.repo.list(workspaceId, repoId);
    return rows.map(toConventionDto);
  }

  async setAccepted(
    workspaceId: string,
    id: string,
    accepted: boolean,
  ): Promise<ConventionCandidate | undefined> {
    const row = await this.repo.setAccepted(workspaceId, id, accepted);
    return row ? toConventionDto(row) : undefined;
  }

  async extract(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    if (!repo.clonePath) throw new ValidationError('Repo is not cloned yet — index it first.');

    const samples = await this.collectSamples(repoId, { owner: repo.owner, name: repo.name });
    if (samples.length === 0) {
      await this.repo.deleteByRepo(workspaceId, repoId);
      return [];
    }
    const byPath = new Map(samples.map((s) => [s.path, s.content]));

    const choice =
      (await getFeatureModelOverride(this.container, workspaceId, 'conventions')) ??
      CONVENTIONS_DEFAULT_MODEL;
    const llm = await this.container.llm(choice.provider);
    const res = await llm.completeStructured({
      model: choice.model,
      schema: ConventionExtraction,
      schemaName: 'ConventionExtraction',
      messages: buildExtractionMessages(samples),
      temperature: 0.2,
      maxRetries: 1,
    });

    const grounded: InsertConvention[] = [];
    for (const c of res.data.candidates) {
      const path = normalizeEvidencePath(c.evidence_path);
      const content = byPath.get(path);
      if (content === undefined) continue; // evidence not from a sampled file
      const loc = locateSnippet(content, c.evidence_snippet);
      if (!loc) continue; // snippet not actually present → drop
      grounded.push({
        workspaceId,
        repoId,
        category: c.category,
        rule: c.rule,
        evidencePath: path,
        evidenceSnippet: c.evidence_snippet,
        evidenceStartLine: loc.start,
        evidenceEndLine: loc.end,
        confidence: c.confidence,
      });
    }

    // A re-scan fully replaces the prior candidate set for this repo.
    await this.repo.deleteByRepo(workspaceId, repoId);
    const rows = await this.repo.insertMany(grounded);
    return rows.map(toConventionDto);
  }

  /** Repo-root config files (whichever exist) + top-ranked source files. */
  private async collectSamples(
    repoId: string,
    ref: { owner: string; name: string },
  ): Promise<Sample[]> {
    const samples: Sample[] = [];
    const seen = new Set<string>();
    const add = async (path: string): Promise<void> => {
      if (seen.has(path)) return;
      seen.add(path);
      try {
        const content = await this.container.git.readFile(ref, path);
        if (content.trim().length > 0) samples.push({ path, content });
      } catch {
        /* missing/unreadable → skip */
      }
    };

    for (const name of CONFIG_FILENAMES) await add(name);
    const ranked = await this.container.repoIntel.getConventionSamples(repoId, SAMPLE_FILE_COUNT);
    for (const path of ranked) await add(path);
    return samples;
  }
}
