# ADR-004: Manual chunk boundaries in vite.config.ts

**Status**: Accepted
**Date**: 2026-03-24
**Deciders**: Project maintainer

## Context

Rollup's automatic code splitting algorithm assigns modules to chunks based on shared usage patterns. In this project, that algorithm produces circular chunk dependencies: module A is in chunk 1 which imports chunk 2 which imports chunk 1. These circular dependencies cause Temporal Dead Zone (TDZ) `ReferenceError` crashes in production builds because ES module evaluation order is deterministic but circular imports create unresolvable initialization order.

The root cause: the `stores` chunk imports `lib/physics` for validation, and `rendering` imports both `stores` (via `getStore()` pattern) and `lib/physics`. Rollup merges modules to minimize chunks, creating cycles.

## Decision

Define explicit chunk boundaries in `vite.config.ts` via `manualChunks`. The chunk DAG is acyclic by construction:

```
core-utils (leaf) <- physics <- stores -> shaders
                         ^                    ^
                  shaders-schroedinger     rendering -> stores
```

Each source module is assigned to exactly one chunk based on its file path. Vendor dependencies are split by package name. Unmatched modules fall through to Rollup's default assignment.

## Alternatives Considered

1. **Rollup auto-splitting**: Produces circular chunks. Rejected.
2. **`output.preserveModules`**: One chunk per module. Eliminates cycles but produces 600+ HTTP requests. Rejected for performance.
3. **Dynamic imports at cycle boundaries**: Breaking cycles via `await import()` at specific call sites. Fragile: any new import can reintroduce cycles, and dynamic imports add latency to hot paths.

## Consequences

**Positive**:
- Zero circular chunk dependencies (enforced by `scripts/check-chunk-cycles.js` in CI)
- Predictable chunk composition: developers know which chunk a module lands in
- Lazy-loaded panels (`components-panels`) reduce initial bundle size

**Negative**:
- Manual maintenance: new modules must match an existing path pattern or be explicitly added
- First-match ordering in `SOURCE_CHUNKS` matters: reordering entries can silently reassign modules

**Ratchets**:
- `scripts/check-chunk-cycles.js` fails CI on any circular chunk dependency
- `scripts/check-bundle-size.js` enforces per-chunk gzip budgets
- Pre-commit hook runs chunk cycle check when `vite.config.ts` changes
