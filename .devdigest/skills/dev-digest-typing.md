# dev-digest-typing

House conventions for `dev-digest`. Flag changes that violate any rule below and cite the offending `file:line`.

## use-explicit-interface-type-annotations-for-function-parameters-and-return-types
Use explicit interface/type annotations for function parameters and return types.

Detected in `server/src/platform/trace-builder.ts:37`:
```
export function buildRunTrace(input: BuildTraceInput): RunTrace {
```

## use-as-const-for-tuple-or-array-literals-when-the-values-should-be-treated-as-readonly-and-literal-types
Use 'as const' for tuple or array literals when the values should be treated as readonly and literal types.

Detected in `server/src/server.ts:13`:
```
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
```
