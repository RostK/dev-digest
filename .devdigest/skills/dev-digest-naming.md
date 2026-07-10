# dev-digest-naming

House conventions for `dev-digest`. Flag changes that violate any rule below and cite the offending `file:line`.

## use-pascalcase-for-class-names-and-camelcase-for-function-and-variable-names
Use PascalCase for class names and camelCase for function and variable names.

Detected in `server/src/platform/price-book.ts:21-24`:
```
export class PriceBook {
  private prices = new Map<string, { in: number; out: number }>();
  private expires = 0;
  private refreshing = false;
```
