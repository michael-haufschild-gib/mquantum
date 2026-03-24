# ADR-006: WASM-optional architecture with JS fallbacks

**Status**: Accepted
**Date**: 2026-03-24
**Deciders**: Project maintainer

## Context

The project uses Rust/WASM (`src/wasm/mdimension_core/`) for high-performance animation math: rotation composition, vertex/edge projection, and matrix/vector operations. WASM provides 2-5x speedup over JavaScript for these operations due to SIMD, no GC pauses, and dense memory layout.

However, WASM introduces build complexity (Rust toolchain, wasm-pack) and fails in environments without `WebAssembly` support or when the `.wasm` binary fails to load (CSP restrictions, CDN errors, Safari SharedArrayBuffer issues).

## Decision

Every WASM function has a JS fallback. The WASM module is loaded asynchronously at startup (`initAnimationWasm()` in `main.tsx`) and is non-blocking. If WASM fails to load, functions gracefully degrade to JS implementations.

The architecture:
1. `src/lib/wasm/` exports public API functions
2. Each function checks if WASM is initialized; if so, calls the WASM binding; otherwise, calls the JS implementation
3. The JS implementation is the canonical reference used in tests
4. CI has separate `ci` (JS-only, always runs) and `wasm` (Rust build, separate job) pipelines

## Alternatives Considered

1. **WASM-required**: Simpler code but breaks in environments without WASM support. Also blocks CI on Rust toolchain availability. Rejected.
2. **JS-only**: Simpler build but loses 2-5x performance for animation math. For smooth 60fps rendering with 11-dimensional rotations, the performance difference is user-visible. Rejected.
3. **Feature detection at build time**: Two separate bundles. Over-engineering: the JS fallback adds negligible bundle size (~2KB).

## Consequences

**Positive**:
- App works everywhere, even with WASM failures
- CI is fast (no Rust build required for the main pipeline)
- WASM module is small (~111KB) and loaded lazily
- Tests validate JS/WASM parity (`src/tests/wasm/animationMathParity.test.ts`)

**Negative**:
- Every WASM function must be implemented twice (Rust + JS)
- Parity between implementations must be tested explicitly
- Debug complexity: performance issues could be either JS or WASM path

**Ratchets**:
- `animationMathParity.test.ts` and `cliffordParity.test.ts` verify JS/WASM produce identical results
- Separate CI job verifies Rust compiles and passes clippy
