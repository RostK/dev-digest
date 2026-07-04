import type { Container } from '../../platform/container.js';
import type {
  ContextAttachment,
  Skill,
  SkillImportPreview,
  SkillSource,
  SkillType,
  SkillVersion,
} from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import { SkillsRepository } from './repository.js';
import { toSkillDto, toSkillVersionDto, parseSkillImport, type SkillPatch } from './helpers.js';
import { DEFAULT_SKILL_SOURCE, MAX_IMPORT_BYTES } from './constants.js';

/**
 * Skills service. Business logic for the Skills tab + Skill Editor + import.
 *
 * A Skill = pure text (a markdown `body`) + light config (name/description/type).
 * It carries NO provider/model/tools — agents reuse skills by linking them. Body
 * changes are versioned via `skill_versions` (repository).
 */

export interface CreateSkillInput {
  name: string;
  description?: string;
  type: SkillType;
  source?: SkillSource;
  body: string;
  enabled?: boolean;
  evidence_files?: string[];
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  source?: SkillSource;
  body?: string;
  enabled?: boolean;
  evidence_files?: string[] | null;
}

export class SkillsService {
  private repo: SkillsRepository;

  constructor(private container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.repo.list(workspaceId);
    return rows.map(toSkillDto);
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      type: input.type,
      source: input.source ?? DEFAULT_SKILL_SOURCE,
      body: input.body,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.evidence_files !== undefined ? { evidenceFiles: input.evidence_files } : {}),
    });
    return toSkillDto(row);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillInput,
  ): Promise<Skill | undefined> {
    const mapped: SkillPatch = {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.source !== undefined ? { source: patch.source } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.evidence_files !== undefined ? { evidenceFiles: patch.evidence_files } : {}),
    };
    const row = await this.repo.update(workspaceId, id, mapped);
    return row ? toSkillDto(row) : undefined;
  }

  /** Delete a skill (and its versions / agent links, via cascade). */
  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  /**
   * Body history for a skill, newest version first. Workspace-scoped: returns
   * undefined when the skill isn't in this workspace (route → 404).
   */
  async listVersions(workspaceId: string, skillId: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(skillId);
    return rows.map(toSkillVersionDto);
  }

  /**
   * Own context docs attached to a skill, ordered (AC-6). Workspace-scoped:
   * returns undefined when the skill isn't in this workspace (route → 404).
   */
  async contextDocs(workspaceId: string, skillId: string): Promise<ContextAttachment[] | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    return this.repo.contextDocsForSkill(skillId);
  }

  /**
   * Replace the skill's context docs — ordered paths ONLY, never text (AC-8).
   * Workspace-scoped: returns undefined when the skill isn't in this workspace
   * (route → 404).
   */
  async setContextDocs(
    workspaceId: string,
    skillId: string,
    paths: string[],
  ): Promise<ContextAttachment[] | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    await this.repo.setContextDocs(skillId, paths);
    return this.repo.contextDocsForSkill(skillId);
  }

  /**
   * Parse an uploaded markdown/zip into a body-only preview. NO persistence and
   * NO execution — the executable part of an archive is never read or run. The
   * caller saves via create() only after the user confirms the preview.
   */
  importPreview(filename: string, contentBase64: string): SkillImportPreview {
    const bytes = Buffer.from(contentBase64, 'base64');
    if (bytes.length === 0) throw new ValidationError('Empty upload.');
    if (bytes.length > MAX_IMPORT_BYTES) {
      throw new ValidationError(
        `Import exceeds the ${Math.round(MAX_IMPORT_BYTES / 1000)} KB limit.`,
      );
    }
    return parseSkillImport(filename, bytes);
  }
}
