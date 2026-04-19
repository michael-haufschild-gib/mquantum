/**
 * JS↔Rust pointwise comparison for the Wheeler–DeWitt leapfrog solver.
 *
 * The TypeScript solver in `src/lib/physics/wheelerDeWitt/solver.ts` is
 * the production implementation. The Rust validator at
 * `src/wasm/mdimension_core/src/wheeler_dewitt.rs` is an independent
 * derivation of the same PDE integrator (see that file's module
 * docstring for the rationale: "if both implementations have a bug, it
 * must be a class-of-bug error in the equations themselves, not a
 * transcription mistake").
 *
 * This test loads the validator binary (built separately via
 * `pnpm wasm:build:validator`) and asserts pointwise agreement on the
 * pure-Lorentzian regime (`Λ ≤ 0` at `m = 0`):
 *
 *  - **Free regime** (`m=0, Λ=0`): every column has `V(φ) = 0`, so
 *    `wdwTurningA` returns null, Stage-2/3 short-circuit, and the TS
 *    output equals the raw leapfrog the Rust validator computes.
 *  - **AdS regime** (`m=0, Λ=−0.5`): same — `V(φ) = Λ < 0` everywhere,
 *    no turning surface, no Stage-2/3 overwrite.
 *
 * For `Λ > 0` or `m > 0` the TS solver applies Stage-2 and Stage-3
 * corrections that the Rust validator deliberately omits, so direct
 * pointwise comparison is meaningless in those regimes.
 *
 * The test is `it.skipIf`-gated on validator-binary presence so CI and
 * developers without the binary built do not hit a hard failure.
 *
 * @module tests/lib/physics/wheelerDeWitt/solverWasmComparison
 */

import { describe, expect, it } from 'vitest'

import {
  resetCflWarningBudget,
  solveWheelerDeWitt,
  type WheelerDeWittSolverInput,
} from '@/lib/physics/wheelerDeWitt/solver'
import {
  isWdwValidatorAvailable,
  solveWheelerDeWittWasmValidator,
} from '@/lib/physics/wheelerDeWitt/wasmValidatorSolver'

const validatorAvailable = isWdwValidatorAvailable()

/** Comparison metrics across two `χ` buffers of identical shape. */
interface DiffMetrics {
  /** Largest absolute pointwise difference. */
  maxAbsDiff: number
  /** Largest absolute value in the TS reference (used as the divisor). */
  maxAbsTs: number
  /** `maxAbsDiff / maxAbsTs` — the headline relative-scale metric. */
  normalisedRelDiff: number
  /** Cell offset (into the interleaved `re,im` buffer) of the worst diff. */
  worstOffset: number
}

/**
 * Compute pointwise difference statistics between two interleaved
 * `(re, im)` buffers. Both inputs MUST be the same length. The
 * normalised metric divides the worst-cell absolute difference by the
 * largest reference magnitude on the grid — this is the right thing to
 * use when raw pointwise relative diff would explode in deep-tail cells
 * with `|χ| → 0`.
 *
 * @param ts - TypeScript-solver output.
 * @param rs - Rust-validator output.
 * @returns Aggregated diff metrics.
 */
function diffMetrics(ts: Float32Array, rs: Float32Array): DiffMetrics {
  if (ts.length !== rs.length) {
    throw new Error(`length mismatch: ts=${ts.length}, rs=${rs.length}`)
  }
  let maxAbsDiff = 0
  let maxAbsTs = 0
  let worstOffset = -1
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i] ?? 0
    const r = rs[i] ?? 0
    const d = Math.abs(t - r)
    if (d > maxAbsDiff) {
      maxAbsDiff = d
      worstOffset = i
    }
    const at = Math.abs(t)
    if (at > maxAbsTs) maxAbsTs = at
  }
  const normalisedRelDiff = maxAbsTs > 0 ? maxAbsDiff / maxAbsTs : maxAbsDiff
  return { maxAbsDiff, maxAbsTs, normalisedRelDiff, worstOffset }
}

/**
 * Reusable comparison body: run both solvers on the same input, assert
 * the normalised pointwise diff stays within `tolerance`, and dump the
 * measured metrics into the test name on failure for debugging.
 *
 * @param input - Shared solver configuration.
 * @param tolerance - Maximum acceptable `maxAbsDiff / maxAbsTs`.
 */
async function assertSolverParity(
  input: WheelerDeWittSolverInput,
  tolerance: number
): Promise<void> {
  resetCflWarningBudget()
  const ts = solveWheelerDeWitt(input)
  const rs = await solveWheelerDeWittWasmValidator({
    boundaryCondition: input.boundaryCondition,
    inflatonMass: input.inflatonMass,
    cosmologicalConstant: input.cosmologicalConstant,
    aMin: input.aMin,
    aMax: input.aMax,
    gridNa: input.gridNa,
    gridNphi: input.gridNphi,
    phiExtent: input.phiExtent,
  })
  expect(rs.gridSize).toEqual(ts.gridSize)
  expect(rs.chi.length).toBe(ts.chi.length)
  const m = diffMetrics(ts.chi, rs.chi)
  // Sanity: the TS output must contain non-trivial magnitude — a regime
  // where everything is zero would pass any tolerance vacuously.
  expect(m.maxAbsTs).toBeGreaterThan(1e-3)
  expect(m.normalisedRelDiff).toBeLessThan(tolerance)
}

describe.skipIf(!validatorAvailable)('Wheeler-DeWitt JS↔Rust pointwise comparison', () => {
  // Skip reason for the skipped describe block surfaces in vitest output:
  //   "Wheeler-DeWitt JS↔Rust pointwise comparison · skipped"
  // To regenerate the validator binary: `pnpm wasm:build:validator`.

  it('matches in the free regime (m=0, Λ=0) within 1e-5 normalised', async () => {
    // Pure free Wheeler–DeWitt: V(φ) ≡ 0, no turning surface, no Stage-2/3.
    // 128 × 17² grid is the user-specified comparison shape.
    await assertSolverParity(
      {
        boundaryCondition: 'noBoundary',
        inflatonMass: 0,
        cosmologicalConstant: 0,
        aMin: 0.05,
        aMax: 1.4,
        gridNa: 128,
        gridNphi: 17,
        phiExtent: 2.5,
      },
      1e-5
    )
  })

  it('matches in the AdS regime (m=0, Λ=-0.5) within 1e-5 normalised', async () => {
    // Pure anti-de Sitter: V(φ) ≡ Λ < 0 everywhere, no turning surface,
    // pure Lorentzian column, no Stage-2/3 overwrite.
    await assertSolverParity(
      {
        boundaryCondition: 'noBoundary',
        inflatonMass: 0,
        cosmologicalConstant: -0.5,
        aMin: 0.05,
        aMax: 1.4,
        gridNa: 128,
        gridNphi: 17,
        phiExtent: 2.5,
      },
      1e-5
    )
  })
})

describe.skipIf(validatorAvailable)(
  'Wheeler-DeWitt JS↔Rust comparison (skipped — validator missing)',
  () => {
    it('skipped because pkg-validator/ is absent (run `pnpm wasm:build:validator`)', () => {
      // Marker test so the skip reason is visible in vitest output even
      // when the describe.skipIf above suppresses the comparison body.
      expect(validatorAvailable).toBe(false)
    })
  }
)
