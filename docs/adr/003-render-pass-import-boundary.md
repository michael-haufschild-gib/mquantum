# ADR-003: Import boundary for render passes

**Status**: Accepted
**Date**: 2026-03-20
**Deciders**: Project maintainer

## Context

The render graph architecture routes store state to passes via `ctx.stores` — a frame context populated by `useSceneStoreWiring.ts`. This design decouples passes from the React/Zustand layer: passes receive pre-read store snapshots each frame, enabling the render graph to batch reads and provide consistent state across all passes in a frame.

However, several pass files imported Zustand stores directly. Investigation revealed two categories:

1. **Diagnostic stores** (tdseDiagnosticsStore, pauliDiagnosticsStore, etc.): Write-direction data flow — passes push diagnostic metrics to stores for UI consumption. This is the reverse of ctx.stores (which is read-direction) and doesn't fit the render graph's store wiring pattern.

2. **performanceStore in TemporalDepthCapturePass**: Read-direction import — reads `temporalReprojectionEnabled` in an `isEnabled()` method called both inside and outside the frame execution context (`getTemporalUniforms()` is called by external consumers before `graph.execute()`).

## Decision

Add `no-restricted-imports` ESLint rule for `src/rendering/webgpu/passes/**/*.ts`:
- Blocks all `@/stores/*` imports by default
- Allows type-only imports (no runtime coupling)
- Exempts specific files that have legitimate store access (diagnostic write-direction stores, BloomPass default constants, TemporalDepthCapturePass performance store read)

Guard test in `eslintGuard.test.ts` verifies exactly 2 `no-restricted-imports` definitions exist (1 enforcement + 1 exemption block).

## Alternatives Considered

1. **Route diagnostic stores through ctx.stores**: Wrong direction — ctx.stores provides read access, diagnostic stores are written by passes. Adding write channels to the render graph would add complexity for no benefit.
2. **No enforcement, documentation only**: The violation was already documented in architecture.md. Documentation alone didn't prevent new direct imports.
3. **Refactor TemporalDepthCapturePass to use ctx.stores**: Would require changing `isEnabled()` and `getTemporalUniforms()` signatures to accept a store snapshot, which breaks the external consumer API.

## Consequences

- New pass files cannot import stores directly — must use ctx.stores or be added to the exemption list
- Existing diagnostic store imports are grandfathered but explicitly listed
- The exemption list is visible in eslint.config.js and guarded by test — drift is detectable
- Future diagnostic stores must be added to the exemption list (acceptable maintenance cost)
