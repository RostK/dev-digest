/** Constants for the skills module. */

/** Initial body version recorded for a newly-created skill. */
export const INITIAL_SKILL_VERSION = 1;

/** Default skill description when none is supplied on insert. */
export const DEFAULT_SKILL_DESCRIPTION = '';

/** Default provenance for skills authored in the editor (imported ones = community). */
export const DEFAULT_SKILL_SOURCE = 'manual' as const;

/**
 * Hard cap on a decoded import payload (bytes). Bounds zip-bomb / oversized-upload
 * risk; the import route raises its bodyLimit to fit the base64 envelope on top.
 */
export const MAX_IMPORT_BYTES = 1_000_000; // ~1 MB
