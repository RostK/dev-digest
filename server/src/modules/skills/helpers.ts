import { unzipSync, strFromU8 } from 'fflate';
import type { Skill, SkillSource, SkillType, SkillVersion } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
import { MAX_IMPORT_BYTES } from './constants.js';

/**
 * Pure helpers for the skills module — DB row ⇄ DTO mapping, the body-version-bump
 * rule, and import parsing (markdown / zip → body only). No I/O.
 */

/** Map a persisted skill row to the public `Skill` DTO (camelCase → snake_case). */
export function toSkillDto(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
  };
}

/** Map a persisted `skill_versions` row to the public `SkillVersion` DTO. */
export function toSkillVersionDto(row: SkillVersionRow): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    created_at: row.createdAt.toISOString(),
  };
}

/** Fields a PUT may patch. Only a BODY change bumps the version (+ snapshots). */
export interface SkillPatch {
  name?: string;
  description?: string;
  type?: SkillType;
  source?: SkillSource;
  body?: string;
  enabled?: boolean;
  evidenceFiles?: string[] | null;
}

/**
 * True when a patch changes the skill BODY — the only versioned field. Metadata
 * (name/description/type) and the `enabled` toggle edit in place without a bump,
 * mirroring the agents rule where toggling `enabled` is not a config change.
 */
export function isBodyChange(existing: Pick<SkillRow, 'body'>, patch: SkillPatch): boolean {
  return patch.body !== undefined && patch.body !== existing.body;
}

// ---- import parsing -------------------------------------------------------

const MARKDOWN_RE = /\.(md|markdown)$/i;
const isMarkdown = (name: string): boolean => MARKDOWN_RE.test(name) && !name.endsWith('/');
const basename = (p: string): string => p.split(/[\\/]/).pop() ?? p;
const stripExt = (name: string): string => basename(name).replace(/\.[^.]+$/, '');

export interface ParsedImport {
  name: string;
  body: string;
  ignored_files: string[];
  warnings: string[];
}

/**
 * Parse an uploaded skill for import. ONLY the markdown body is extracted: a `.md`
 * file is read as UTF-8; a `.zip` decompresses its markdown entries ONLY — every
 * other entry is listed (so the user sees what's in the archive) but is never
 * decompressed, written to disk, or executed. A foreign skill is foreign
 * instructions, so the caller saves it only after the user confirms the preview.
 *
 * Throws ValidationError when the upload yields no usable skill body.
 */
export function parseSkillImport(filename: string, bytes: Uint8Array): ParsedImport {
  const lower = filename.toLowerCase();

  if (MARKDOWN_RE.test(lower) || lower.endsWith('.txt')) {
    const body = strFromU8(bytes).trim();
    if (!body) throw new ValidationError('The uploaded file is empty.');
    return { name: stripExt(filename), body, ignored_files: [], warnings: [] };
  }

  if (lower.endsWith('.zip')) {
    const seen: string[] = [];
    // Budget for DECOMPRESSED markdown bytes. The compressed-input cap (service,
    // MAX_IMPORT_BYTES on the decoded upload) can't stop a zip-bomb that inflates
    // ~1000:1, so we also bound the uncompressed size BEFORE fflate inflates each
    // markdown entry.
    let decodedBudget = MAX_IMPORT_BYTES;
    let entries: Record<string, Uint8Array>;
    try {
      // filter() runs for EVERY entry; we record real-file names but only return
      // true (→ decompress) for markdown, so an archive's executable/binary
      // payload is never inflated or read.
      entries = unzipSync(bytes, {
        filter: (f) => {
          const isDir = f.name.endsWith('/');
          const isMacJunk = f.name.startsWith('__MACOSX/');
          if (!isDir && !isMacJunk) seen.push(f.name);
          if (!(isMarkdown(f.name) && !isMacJunk)) return false;
          // f.originalSize is the entry's UNCOMPRESSED size from the zip
          // directory; refuse before inflating if it would blow the budget.
          if (f.originalSize > decodedBudget) {
            throw new ValidationError(
              'The skill archive decompresses to more than the import limit.',
            );
          }
          decodedBudget -= f.originalSize;
          return true;
        },
      });
    } catch (err) {
      // Keep a precise size error; mask only genuine archive-read failures.
      if (err instanceof ValidationError) throw err;
      throw new ValidationError('Could not read the .zip archive.');
    }

    const mdNames = Object.keys(entries);
    if (mdNames.length === 0) {
      throw new ValidationError('Archive contains no markdown (.md) skill body.');
    }
    // Prefer a conventional SKILL.md; otherwise the first markdown by sorted path.
    const chosen =
      mdNames.find((n) => basename(n).toLowerCase() === 'skill.md') ?? [...mdNames].sort()[0]!;
    const body = strFromU8(entries[chosen]!).trim();
    if (!body) throw new ValidationError('The skill body in the archive is empty.');

    const ignored = seen.filter((n) => n !== chosen);
    const warnings: string[] = [];
    if (ignored.length > 0) {
      warnings.push(
        `Archive contained ${ignored.length} other file(s) which were ignored and never executed.`,
      );
    }
    return { name: stripExt(filename), body, ignored_files: ignored, warnings };
  }

  throw new ValidationError('Unsupported file type. Upload a .md or .zip skill.');
}
