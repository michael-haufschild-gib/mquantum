/* eslint-disable no-console -- CLI benchmark prints results to stdout by design. */
/* global process -- Node runtime script; `process` is a platform global, not a browser symbol. */
/**
 * Peschel entanglement-probe benchmark.
 *
 * Measures `runPeschelCompute` wall-clock time at N = 128 and N = 256
 * (the production MAX_PROBE_GRIDSIZE cap). Used to validate the
 * MAX_PROBE_GRIDSIZE guard in `FSFEntanglementProbe.tsx` and decide
 * whether a Rust/WASM port of the Jacobi eigensolver is worth the
 * complexity.
 *
 * Run with:
 *   npx tsx scripts/benchmark-peschel.ts
 *
 * The script prints a small table with per-run timings, the min/median
 * timings, and the peak heap delta for each configuration.
 *
 * ## Recorded results (2026-04-11, Node v24.14.1, Darwin arm64)
 *
 * | Config | median | mean |
 * | -------- | ---------- | ---------- |
 * | N=128   |   68.93 ms |   69.62 ms |
 * | N=256   | 1096.79 ms | 1098.49 ms |
 *
 * Scaling ratio N=256 / N=128 = 15.91× (matches the predicted O(N⁴/4)).
 *
 * ## Decision record: Rust port (task #7)
 *
 * The probe runs in a dedicated Web Worker so the 1.1 s compute at
 * N=256 does not block the main thread — the UI simply shows a
 * "Computing entanglement spectrum…" spinner. A Rust/WASM port would
 * trade an estimated 3-8× speedup for: (a) a new `jacobi_eigendecompose`
 * Rust function returning vectors as well as values (existing
 * `hermitian_eigenvalues` returns only values), (b) ~40 KB of WASM
 * binary bloat, (c) wasm-pack build-time cost, and (d) ongoing
 * maintenance of a second implementation. At 1.1 s off-thread the cap
 * is ergonomically acceptable; the condition on task #7 is NOT met and
 * the Rust port is deferred. Revisit if (i) user feedback flags the
 * cap as painful, (ii) MAX_PROBE_GRIDSIZE is raised to ≥ 384
 * (estimated ~5.5 s) in a future iteration, or (iii) the UI moves the
 * sweep off the worker into the main thread.
 *
 * ## MAX_PROBE_GRIDSIZE review (task #8)
 *
 * Keep MAX_PROBE_GRIDSIZE = 256. At the current 15.91× O(N⁴/4) scaling,
 * raising to 384 would cost ~5.5 s (tolerable but noticeable) and
 * raising to 512 would cost ~17 s (unacceptable for interactive
 * scrubbing). The 256 cap lands at ~1 s — the sweet spot where the
 * worker's debounce (120 ms) and the sweep time stay under the 1.5 s
 * "feels instant" threshold for analysis panels.
 *
 * @module scripts/benchmark-peschel
 */

import { performance } from 'node:perf_hooks'

import {
  resetPeschelCacheForTests,
  runPeschelCompute,
} from '../src/lib/physics/entanglement/peschelWorker'

interface BenchResult {
  label: string
  n: number
  samples: number[]
  heapDeltaMB: number
}

/**
 * Warm up the JIT with a small N=32 run before the real timings start,
 * so V8's tier-up doesn't bias the first measured sample.
 */
function warmUp(): void {
  for (let i = 0; i < 3; i++) {
    resetPeschelCacheForTests()
    runPeschelCompute({
      type: 'compute',
      epoch: 0,
      gridSize: [32],
      spacing: [1],
      latticeDim: 1,
      massSq: 0,
      subsystemLength: 8,
    })
  }
  // Leave the cache empty so the first timed iteration measures a
  // full cold sweep, not a warm-up cache hit.
  resetPeschelCacheForTests()
}

/**
 * Run `runPeschelCompute` `runs` times at grid size `n` and return the
 * wall-clock timings + heap delta.
 */
function benchOne(label: string, n: number, runs: number): BenchResult {
  // Best-effort GC to normalize heap measurements across configs. V8
  // only exposes `global.gc` when launched with `--expose-gc`, so we
  // guard the call. Without a GC hook, `heapDeltaMB` is still useful
  // as an upper bound (includes any residual allocation from previous
  // configs).
  const maybeGc: (() => void) | undefined = (globalThis as unknown as { gc?: () => void }).gc
  if (maybeGc) maybeGc()

  const beforeHeap = process.memoryUsage().heapUsed
  const samples: number[] = []
  for (let i = 0; i < runs; i++) {
    // Drop any prior sweep cache so every iteration measures the full
    // O(N⁴/4) correlator scan, not the cache-hit fast path that would
    // collapse runs 2..K to a few microseconds and skew the reported
    // median / scaling ratio below.
    resetPeschelCacheForTests()
    const t0 = performance.now()
    runPeschelCompute({
      type: 'compute',
      epoch: i,
      gridSize: [n],
      spacing: [1],
      latticeDim: 1,
      massSq: 0,
      subsystemLength: Math.floor(n / 4),
    })
    const dt = performance.now() - t0
    samples.push(dt)
  }
  const afterHeap = process.memoryUsage().heapUsed
  return {
    label,
    n,
    samples,
    heapDeltaMB: (afterHeap - beforeHeap) / (1024 * 1024),
  }
}

/**
 * Summary stats for a set of samples.
 */
function stats(samples: number[]): { min: number; median: number; max: number; mean: number } {
  const sorted = [...samples].sort((a, b) => a - b)
  const min = sorted[0]!
  const max = sorted[sorted.length - 1]!
  const median = sorted[Math.floor(sorted.length / 2)]!
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length
  return { min, median, max, mean }
}

/** Format a millisecond value with 2-decimal padding. */
function ms(x: number): string {
  return `${x.toFixed(2).padStart(9)} ms`
}

function main(): void {
  console.log('Peschel entanglement-probe benchmark')
  console.log('=====================================\n')

  warmUp()

  const configs: Array<{ label: string; n: number; runs: number }> = [
    { label: 'N=128 (full sweep L=1..64)', n: 128, runs: 5 },
    { label: 'N=256 (full sweep L=1..128, MAX_PROBE_GRIDSIZE cap)', n: 256, runs: 3 },
  ]

  const results: BenchResult[] = []
  for (const cfg of configs) {
    process.stdout.write(`[${cfg.label}] running ${cfg.runs} iterations... `)
    const r = benchOne(cfg.label, cfg.n, cfg.runs)
    results.push(r)
    process.stdout.write('done\n')
  }

  console.log('\nResults:')
  console.log('---------')
  for (const r of results) {
    const s = stats(r.samples)
    console.log(`\n${r.label}`)
    console.log(`  samples:  [${r.samples.map((x) => x.toFixed(1)).join(', ')}] ms`)
    console.log(`  min:     ${ms(s.min)}`)
    console.log(`  median:  ${ms(s.median)}`)
    console.log(`  mean:    ${ms(s.mean)}`)
    console.log(`  max:     ${ms(s.max)}`)
    console.log(`  heap:    ${r.heapDeltaMB.toFixed(1).padStart(6)} MB (delta over run)`)
  }

  // Cost-doubling check: the full sweep scales as Σ L³ for L = 1..N/2
  //   ≈ (N/2)⁴ / 4
  // so doubling N multiplies median time by ~16. The ratio is a sanity
  // check — anything between 8× and 32× is "expected"; outside that
  // suggests the inner loop changed asymptotic complexity.
  if (results.length >= 2) {
    const [r128, r256] = results as [BenchResult, BenchResult]
    const s128 = stats(r128.samples)
    const s256 = stats(r256.samples)
    const ratio = s256.median / s128.median
    console.log(`\nscaling ratio (N=256 / N=128 median): ${ratio.toFixed(2)}× (expect ~16×)`)
  }
}

main()
