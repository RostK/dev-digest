import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SkillSource, SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { SkillsService } from './service.js';

/**
 * Skills module — CRUD over reusable, user-editable skill bodies (linked to
 * agents by the agents module). DB is the source of truth.
 *   GET    /skills                 → list (workspace-scoped)
 *   GET    /skills/:id             → one skill
 *   POST   /skills                 → create (snapshots body v1)
 *   PUT    /skills/:id             → update (bumps version when the body changes)
 *   DELETE /skills/:id             → delete (versions + agent links cascade)
 *   GET    /skills/:id/versions    → body history (newest first)
 *   GET    /skills/:id/context     → own Project Context docs (ordered)
 *   POST   /skills/:id/context     → replace the ordered set of attached docs
 *   POST   /skills/import/preview  → parse md/zip → body-only preview (no save, no exec)
 */

/**
 * Defense-in-depth path-safety guard for an attached context doc path (security
 * A05) — re-checked at read time (T6). Rejects: `..` traversal segments, an
 * absolute path, a drive letter (`C:`), a URL scheme (`http://`), and anything
 * not ending in `.md` (Project Context only ever attaches markdown).
 */
const isSafeContextPath = (p: string): boolean => {
  if (!p || p.startsWith('/') || p.startsWith('\\')) return false;
  if (/^[a-zA-Z]:/.test(p)) return false; // drive letter, e.g. C:\...
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(p)) return false; // scheme://, e.g. http://
  if (p.split(/[\\/]/).some((seg) => seg === '..')) return false;
  return p.toLowerCase().endsWith('.md');
};

const ContextPathValue = z
  .string()
  .min(1)
  .refine(isSafeContextPath, { message: 'Unsafe context doc path' });

/**
 * Ordered set of context doc paths to attach (AC-6, AC-8: paths only, never
 * text). Each entry is either a plain path string or a `{ path, order }`
 * ContextAttachment — either way the persisted `order` is the array POSITION,
 * never a client-supplied value, so the set can't be corrupted by gaps/dupes.
 */
const ContextPathEntry = z.union([
  ContextPathValue,
  z.object({ path: ContextPathValue, order: z.number().int().optional() }),
]);
const SetContextBody = z.array(ContextPathEntry);

const CreateSkillBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: SkillType,
  source: SkillSource.optional(),
  body: z.string().min(1),
  enabled: z.boolean().optional(),
  evidence_files: z.array(z.string()).optional(),
});

const UpdateSkillBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  type: SkillType.optional(),
  source: SkillSource.optional(),
  body: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  evidence_files: z.array(z.string()).nullish(),
});

const ImportPreviewBody = z.object({
  filename: z.string().min(1),
  content_base64: z.string().min(1),
});

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService(app.container);

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.post('/skills', { schema: { body: CreateSkillBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const b = req.body;
    const skill = await service.create(workspaceId, {
      name: b.name,
      type: b.type,
      body: b.body,
      ...(b.description !== undefined ? { description: b.description } : {}),
      ...(b.source !== undefined ? { source: b.source } : {}),
      ...(b.enabled !== undefined ? { enabled: b.enabled } : {}),
      ...(b.evidence_files !== undefined ? { evidence_files: b.evidence_files } : {}),
    });
    reply.status(201);
    return skill;
  });

  app.put('/skills/:id', { schema: { params: IdParams, body: UpdateSkillBody } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.update(workspaceId, req.params.id, req.body);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Skill not found');
    return { ok: true };
  });

  app.get('/skills/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const versions = await service.listVersions(workspaceId, req.params.id);
    if (!versions) throw new NotFoundError('Skill not found');
    return versions;
  });

  app.get('/skills/:id/context', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const docs = await service.contextDocs(workspaceId, req.params.id);
    if (!docs) throw new NotFoundError('Skill not found');
    return docs;
  });

  app.post(
    '/skills/:id/context',
    { schema: { params: IdParams, body: SetContextBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const paths = req.body.map((entry) => (typeof entry === 'string' ? entry : entry.path));
      const docs = await service.setContextDocs(workspaceId, req.params.id, paths);
      if (!docs) throw new NotFoundError('Skill not found');
      return docs;
    },
  );

  // Raise the body limit so a base64-encoded upload (≈1.37× the raw bytes) fits;
  // the service still caps the DECODED size at MAX_IMPORT_BYTES.
  app.post(
    '/skills/import/preview',
    { schema: { body: ImportPreviewBody }, bodyLimit: 2_000_000 },
    async (req) => {
      await getContext(app.container, req);
      return service.importPreview(req.body.filename, req.body.content_base64);
    },
  );
}
