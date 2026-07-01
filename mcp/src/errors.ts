/**
 * ForwardError — an expected, model-facing recoverable error.
 *
 * Thrown by resolve/poll helpers when the user-supplied identifiers do not
 * match what the API returns. The message is always forward-leading: it names
 * the next step or enumerates the valid options so the model can recover
 * without human intervention.
 *
 * Tool handlers catch ForwardError and return it as { isError: true, ... }
 * instead of propagating it as an unhandled exception.
 */
export class ForwardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForwardError';
    // Preserve the correct constructor in V8 stack traces.
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ForwardError);
    }
  }
}
