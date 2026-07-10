# dev-digest-async

House conventions for `dev-digest`. Flag changes that violate any rule below and cite the offending `file:line`.

## use-async-await-for-asynchronous-operations-including-main-entrypoints-and-file-i-o
Use async/await for asynchronous operations, including main entrypoints and file I/O.

Detected in `server/src/server.ts:5`:
```
async function main() {
  const config = loadConfig();
  const app = await buildApp({ config });

  // Graceful shutdown: on SIGTERM/SIGINT close the server, which runs the
  // onClose hooks (drains in-flight requests/SSE, closes the postgres pool).
```
