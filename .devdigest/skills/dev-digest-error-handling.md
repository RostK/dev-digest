# dev-digest-error-handling

House conventions for `dev-digest`. Flag changes that violate any rule below and cite the offending `file:line`.

## handle-errors-explicitly-with-try-catch-blocks-and-log-errors-before-exiting-or-rethrowing
Handle errors explicitly with try/catch blocks and log errors before exiting or rethrowing.

Detected in `server/src/server.ts:28-34`:
```
try {
    await app.listen({ port: config.apiPort, host: '0.0.0.0' });
    app.log.info(`DevDigest API listening on http://localhost:${config.apiPort}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
```

## use-explicit-error-classes-extending-error-for-custom-error-types
Use explicit error classes (extending Error) for custom error types.

Detected in `server/src/platform/resilience.ts:6-11`:
```
export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Operation timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}
```
