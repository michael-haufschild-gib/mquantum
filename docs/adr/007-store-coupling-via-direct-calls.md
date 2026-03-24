# ADR-007: Store coupling via direct getState() calls

**Status**: Accepted
**Date**: 2026-03-24
**Deciders**: Project maintainer

## Context

Zustand stores in this project sometimes need to coordinate state changes across multiple stores. For example, changing the dimension in `geometryStore` must also update `animationStore`, `rotationStore`, and `transformStore` because those stores have dimension-dependent state (rotation planes, animation targets, transform matrices).

## Decision

Stores call other stores directly via `useOtherStore.getState().action()` for synchronous cross-store coordination. This pattern is used in:

- `geometryStore.setDimension()` -> `animationStore.setDimension()`, `rotationStore.setDimension()`, `transformStore.setDimension()`
- `geometryStore.setObjectType()` -> `performanceStore.setSceneTransitioning()`
- `presetManagerStore.loadScene()` -> all stores for state restoration

## Alternatives Considered

1. **Event bus / pub-sub**: Decouples stores but makes execution order non-deterministic. For dimension changes, order matters: dependent stores must update before the geometry store sets its new state, so downstream consumers see consistent state. Rejected.
2. **Zustand middleware**: Intercept `set()` calls and dispatch to other stores. Adds indirection without reducing coupling — the middleware still needs to know which stores to call. Rejected.
3. **Single monolithic store**: Eliminates cross-store calls but creates a god object. With 20+ stores, this would be unmaintainable. Rejected.
4. **React useEffect synchronization**: Stores update in response to each other via effects. Creates render cascades (N stores -> N re-renders) and makes execution order dependent on React's scheduling. Rejected for both performance and determinism.

## Consequences

**Positive**:
- Synchronous execution: all stores update in a single microtask
- Deterministic order: the calling store controls the sequence
- React 18+ automatic batching groups all `set()` calls into one re-render
- Call sites are explicit and grep-able

**Negative**:
- Tight coupling: `geometryStore` directly imports `animationStore`, `rotationStore`, `transformStore`, `performanceStore`
- Adding a new dimension-dependent store requires updating `propagateDimensionToStores()`
- Import cycles are possible (mitigated by Zustand's lazy evaluation — `getState()` doesn't execute at import time)

**Ratchets**:
- Render pass import boundary (ESLint `no-restricted-imports`) prevents passes from importing stores directly — passes use `getStore(ctx, 'name')` instead
- Tests verify cross-store propagation (`geometryStore.test.ts` checks that dimension changes reach dependent stores)
