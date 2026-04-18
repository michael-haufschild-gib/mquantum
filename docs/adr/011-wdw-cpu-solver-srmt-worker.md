# ADR-011: Wheeler–DeWitt solver on CPU main thread; SRMT diagnostic in Web Worker

**Status**: Accepted
**Date**: 2026-04-18
**Deciders**: Project maintainer

## Context

The Wheeler–DeWitt (WdW) minisuperspace mode solves a 3D PDE on
`a × φ₁ × φ₂` with default grid `(Na=128, Nphi=32)` → 131 k complex
cells. The solver takes ~10–15 ms per full march on budget hardware,
which is acceptable for interactive physics-field changes (user drags a
slider: solver re-runs, density texture re-uploaded on the same frame).

The SRMT (Superspace-Relational Modular Time) diagnostic is a separate
workload:

- **Schmidt decomposition** of `χ` via complex SVD → `O(min(m, n)³)`
  on matrices of size `Na × Nphi²` (e.g. 128×1024), ~300 MB of work.
- **Hamilton–Jacobi eigenproblem** on the clock slice via top-k
  Lanczos → `O(k · n²)` dense matrix-vector per iteration on an `n ×
  n` operator, where `n = Nphi²` (clock `a`, 1024×1024) or `Na · Nphi`
  (clocks `φ₁`/`φ₂`, 4096×4096).

The combined SRMT compute takes 0.5 – 3 s per clock at the default
grid, depending on convergence. Running all three clocks back-to-back
costs 2–10 s. This is too long to block the main thread — dragging a
parameter slider would freeze the UI, and rAF-driven rendering would
stutter.

## Decision

1. **WdW solver stays on the main thread.** It runs synchronously
   inside `WheelerDeWittStrategy.executeFrame` whenever the config
   hash changes. The strategy caches the solver output so subsequent
   frames (e.g. worldline-pulse animation) do NOT re-solve.

2. **SRMT diagnostic runs on a dedicated Web Worker** — one worker per
   strategy instance, constructed lazily. The worker receives a copy
   of the cached `χ` + Lorentzian mask (transferred via `postMessage`
   transferables to avoid a structured-clone copy), runs
   `computeSrmtDiagnostic` in isolation, and posts back the result.

3. **Cross-clock queue is sequential.** Running three workers in
   parallel would triple peak memory (each needs an HJ operator of up
   to 64 MB for clock `a`, 256 MB for φ-clocks) and contend on the
   single CPU core JS workers get. Instead, the dispatcher queues all
   three clocks on one worker, selected-clock-first, draining the
   queue one at a time with auto-advance on reply.

4. **Worker is created lazily** — only on the first SRMT compute. A
   user who never enables SRMT pays zero cost (no worker thread, no
   worker-bundle download).

## Alternatives Considered

1. **Move the WdW solver into the worker too.** Rejected: the solver
   is fast enough that copying `χ` + mask across the worker boundary
   on every config change would dominate. The main-thread solver is a
   clean 10-15 ms slice that doesn't meaningfully stutter rendering.

2. **Run SRMT on the main thread, split into microtasks.** Rejected:
   the O(n³) SVD does not split cleanly into short chunks, and
   microtask scheduling introduces hard-to-debug race conditions with
   the render loop.

3. **Run all three clocks in parallel on three workers.** Rejected on
   memory grounds (see Decision #3). The user-perceived benefit is
   small — the selected-clock snapshot appears first either way, and
   the cross-clock comparison table fills in over a couple of seconds
   regardless of parallelism.

4. **WASM port of SRMT now.** Deferred to Phase 6. The bottleneck is
   the dense HJ eigendecomposition; a sparse representation + Krylov
   iteration in Rust would be 5-10× faster, but the current
   JS-Lanczos implementation is already fast enough that the worker
   isolation alone unblocks the UX. A WASM port is cleanly layered
   behind the existing worker interface — no API changes required.

## Consequences

- The WdW strategy holds two distinct cached states: the solver
  output (main-thread cache, invalidated on solver-hash change) and
  the SRMT per-clock results (`SrmtWorkerState.resultsByClock`,
  invalidated on SRMT-compute-hash change).
- The worker bundle is downloaded on demand via Vite's
  `new Worker(new URL(...))` pattern. First-SRMT-enable is slightly
  slower than subsequent toggles.
- Cancelling a queue is a two-step operation: bump the epoch so
  in-flight replies are dropped, then clear the queue. Tests under
  `WheelerDeWittSrmtWorker.*.test.ts` cover the edge cases (mid-queue
  cancel, toggle-off while in-flight, strategy adoption handoff).
- Memory ceiling: one worker × one HJ matrix at a time ≈ 64–256 MB
  peak transient allocation depending on clock. The enclosing budget
  matches the browser's typical typed-array ceiling.

## Follow-ups

- [ ] Phase 6: port the HJ operator + Lanczos into Rust/WASM for a
      sparse, cache-friendly implementation. Target: <100 ms per
      clock on default grid.
- [ ] Once WASM lands, consider parallel all-clock dispatch — the
      transient allocation is cheaper and the cross-clock table
      completes faster.
