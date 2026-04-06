# ADR-009: WASM bridge uses inline boilerplate, not a shared helper

**Status**: Accepted
**Date**: 2026-04-05
**Deciders**: Project maintainer

## Context

`src/lib/wasm/animation-wasm.ts` contains 19 exported functions that bridge JavaScript to Rust/WASM. Every function follows the same pattern:

```typescript
export function fooWasm(args): T | null {
  if (!wasmReady || !wasmModule) { return null }
  try {
    return wasmModule.foo_wasm(args)
  } catch (err) {
    logger.warn('[AnimationWASM] foo_wasm failed:', err)
    return null
  }
}
```

This looks like textbook duplication — 19 copies of the same guard/try-catch/log pattern. A consolidation audit attempted to extract a shared `tryWasm` helper:

```typescript
function tryWasm<T>(fnName: string, execute: () => T): T | null {
  if (!wasmReady || !wasmModule) return null
  try { return execute() }
  catch (err) { logger.warn(`[AnimationWASM] ${fnName} failed:`, err); return null }
}

export function fooWasm(args): T | null {
  return tryWasm('foo_wasm', () => wasmModule!.foo_wasm(args))
}
```

This reduced the file by ~190 lines but was reverted.

## Decision

Keep the inline boilerplate. Do not extract a shared helper for the WASM bridge functions.

## Rationale

The `tryWasm` helper allocates a **closure on every call** (`() => wasmModule!.fn(args)`). The original inline pattern has **zero allocations**.

Several of these functions run in the animation loop every frame at 60fps:
- `composeRotationsIndexedWasm` — called per frame for N-dimensional rotation
- `multiplyMatrixVectorWasm` — called per frame for vertex projection

Per-frame closure allocation creates GC pressure. While each allocation is ~100ns, the principle matters: the animation loop should be allocation-free. In a WebGPU renderer targeting consistent frame times, any avoidable GC pause is a frame time spike.

The try/catch itself is not the issue — V8 has zero overhead for try/catch on the non-throwing path. Both versions have try/catch. The closure is the sole difference.

## Alternatives Considered

1. **`tryWasm` helper with closure** (attempted, reverted): Clean but allocates per call. Wrong tradeoff for hot-path code.
2. **Code generation / macro**: Would eliminate duplication at build time without runtime cost, but introduces build complexity for marginal value. Over-engineering.
3. **Inline boilerplate** (chosen): Verbose but zero-allocation, no indirection, trivially debuggable. Each function is self-contained.

## Consequences

**Positive**:
- Zero per-call allocation in the animation loop
- Each function is self-contained and trivially debuggable
- No abstraction to understand when adding a new WASM function

**Negative**:
- ~190 lines of repeated boilerplate across 19 functions
- Adding a new WASM function requires copying the pattern manually
- If the error handling strategy changes, 19 functions must be updated

**Acceptable because**: New WASM functions are added rarely (~2-3 per quarter). The pattern is simple enough that copy-paste errors are unlikely. The performance guarantee matters more than DRY in a 60fps render loop.
