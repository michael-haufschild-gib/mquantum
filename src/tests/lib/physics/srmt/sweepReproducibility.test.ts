/**
 * Deterministic-reproducibility tests for the SRMT pipeline.
 *
 * The SRMT diagnostic relies on Lanczos iteration to extract the HJ
 * operator's dominant eigenvalues. Lanczos uses a random starting
 * vector, which — if left unseeded — would make each sweep run produce
 * slightly different `q` values in the 6th–7th digit. Publications and
 * parameter-space explorations need bit-identical outputs from
 * bit-identical inputs.
 *
 * This file pins three invariants:
 *  1. `lanczosTopKOp` with its default seed produces bit-exact results
 *     across two calls.
 *  2. A full `runCutSweep` invocation produces bit-exact `quality`
 *     values across two calls — this is the end-user contract.
 *  3. The CSV export `sweepPointsToCsv` (with `computeMs` canonicalised
 *     to zero) produces byte-identical output across two runs.
 *
 * `computeMs` is excluded from byte-exactness because it is wall-clock
 * timing, which will always differ. Everything else — the measured
 * spectra, qualities, σ values — is deterministic and byte-exact.
 */
import { describe, expect, it } from 'vitest'

import { sweepPointsToCsv } from '@/components/sections/Analysis/srmtSweepHelpers'
import { DEFAULT_WHEELER_DEWITT_CONFIG } from '@/lib/geometry/extended/wheelerDeWitt'
import { type SrmtClock } from '@/lib/physics/srmt'
import { lanczosTopKOp, type LinearOperator } from '@/lib/physics/srmt/lanczos'
import { runCutSweep } from '@/lib/physics/srmt/sweepDriver'
import { buildSrmtSweepManifest } from '@/lib/physics/srmt/sweepManifest'
import type { SrmtSweepConfig, SrmtSweepPoint } from '@/lib/physics/srmt/sweepTypes'
import {
  solveWheelerDeWitt,
  type WheelerDeWittSolverInput,
} from '@/lib/physics/wheelerDeWitt/solver'

/**
 * Build a small Hermitian-symmetric test matrix and wrap it as a
 * {@link LinearOperator}. The exact entries are irrelevant — what
 * matters is that Lanczos is reproducible against the SAME operator.
 */
function buildTestOperator(n: number): { apply: LinearOperator; infNorm: number } {
  const A = new Float64Array(n * n)
  for (let i = 0; i < n; i++) {
    A[i * n + i] = 2 + 0.1 * i
    if (i > 0) {
      A[i * n + (i - 1)] = -1
      A[(i - 1) * n + i] = -1
    }
  }
  let infNorm = 0
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let j = 0; j < n; j++) s += Math.abs(A[i * n + j]!)
    if (s > infNorm) infNorm = s
  }
  const apply: LinearOperator = (x, y) => {
    for (let i = 0; i < n; i++) {
      let acc = 0
      const row = i * n
      for (let j = 0; j < n; j++) acc += A[row + j]! * x[j]!
      y[i] = acc
    }
  }
  return { apply, infNorm }
}

describe('Lanczos determinism', () => {
  it('default-seed lanczosTopKOp produces byte-identical output across runs', () => {
    const n = 24
    const k = 6
    const { apply, infNorm } = buildTestOperator(n)
    const run1 = lanczosTopKOp(apply, n, k, infNorm)
    const run2 = lanczosTopKOp(apply, n, k, infNorm)
    expect(run1.length).toBe(k)
    expect(run2.length).toBe(k)
    // Assert bit-exact byte equality. An off-by-one in the Krylov basis
    // due to a seed drift would manifest as differences in the 6th-7th
    // decimal; byte-exactness rules that out.
    const b1 = new Uint8Array(run1.buffer, run1.byteOffset, run1.byteLength)
    const b2 = new Uint8Array(run2.buffer, run2.byteOffset, run2.byteLength)
    expect(Array.from(b1)).toEqual(Array.from(b2))
    // Also pin that the spectrum isn't all zeros — byte-exactness on an
    // empty array is a trivial pass.
    // Tridiagonal (2 + 0.1·i on the diagonal, −1 on the off-diagonals) has
    // the largest eigenvalue between the extremes of its diagonal band
    // plus a bounded perturbation — well above 1 for n = 24.
    expect(run1[0]).toBeGreaterThan(1)
  })

  it('explicit-seed lanczosTopKOp is deterministic across two invocations', () => {
    const n = 24
    const k = 6
    const { apply, infNorm } = buildTestOperator(n)
    const seed1a = lanczosTopKOp(apply, n, k, infNorm, { seed: 0xdeadbeef })
    const seed1b = lanczosTopKOp(apply, n, k, infNorm, { seed: 0xdeadbeef })
    // Seed drives the starting vector; same seed → bit-exact output.
    // Note: full-reorth Lanczos converges to the same eigenvalues
    // regardless of seed for well-separated spectra, so we don't assert
    // that different seeds produce *different* outputs — the production
    // correctness property is that `lanczosTopKOp` converges to the
    // operator's real spectrum, which is seed-independent.
    expect(Array.from(seed1a)).toEqual(Array.from(seed1b))
    // And the result is non-trivial.
    expect(seed1a.length).toBe(k)
    expect(seed1a[k - 1]).toBeGreaterThan(0)
  })
})

describe('SRMT cut-sweep determinism', () => {
  /**
   * Shared config used across the sweep reproducibility tests. Values
   * picked so the solver runs quickly while still exercising the full
   * Schmidt + Lanczos + affine-fit pipeline.
   */
  const WDW_INPUT: WheelerDeWittSolverInput = {
    boundaryCondition: 'noBoundary',
    inflatonMass: 0.3,
    cosmologicalConstant: 0.1,
    aMin: 0.1,
    aMax: 1.2,
    gridNa: 48,
    gridNphi: 13,
    phiExtent: 1.5,
  }
  const SWEEP_CFG: SrmtSweepConfig = {
    kind: 'cut',
    points: 5,
    clocks: ['a', 'phi1'],
    rankCap: 24,
    cutNormalized: 0.5,
    phiRef: 0.75,
    sweepMin: 0.2,
    sweepMax: 0.8,
  }

  /**
   * Return a deep structural clone of a sweep point with `computeMs`
   * zeroed. Used for byte-exact comparison of CSV output between runs:
   * `computeMs` is wall-clock and will always differ.
   */
  function canonicalize(p: SrmtSweepPoint): SrmtSweepPoint {
    return { ...p, computeMs: 0 }
  }

  /**
   * Extract the numeric fields worth asserting bit-exact equality on.
   * Typed arrays are compared via their raw byte buffers; scalars via
   * direct `toEqual` (which handles NaN correctly via Vitest).
   */
  function scalarKey(p: SrmtSweepPoint): Record<string, unknown> {
    const clockQ = (c: SrmtClock) => p.quality[c] ?? null
    const clockS = (c: SrmtClock) => p.qStdev?.[c] ?? null
    return {
      index: p.index,
      sweepValue: p.sweepValue,
      cutNormalized: p.cutNormalized,
      qa: clockQ('a'),
      qp1: clockQ('phi1'),
      qp2: clockQ('phi2'),
      sa: clockS('a'),
      sp1: clockS('phi1'),
      sp2: clockS('phi2'),
    }
  }

  it('runCutSweep produces bit-exact qualities across two runs', () => {
    // Build two *independent* solver outputs so any silent in-place mutation
    // of solverOutput buffers cannot mask a reproducibility regression.
    const solverA = solveWheelerDeWitt(WDW_INPUT)
    const solverB = solveWheelerDeWitt(WDW_INPUT)
    const pointsA = runCutSweep({
      solverOutput: solverA,
      config: SWEEP_CFG,
      physics: {
        inflatonMass: WDW_INPUT.inflatonMass,
        cosmologicalConstant: WDW_INPUT.cosmologicalConstant,
      },
    })
    const pointsB = runCutSweep({
      solverOutput: solverB,
      config: SWEEP_CFG,
      physics: {
        inflatonMass: WDW_INPUT.inflatonMass,
        cosmologicalConstant: WDW_INPUT.cosmologicalConstant,
      },
    })
    expect(pointsA.length).toBe(pointsB.length)
    expect(pointsA.length).toBeGreaterThan(0)
    for (let i = 0; i < pointsA.length; i++) {
      expect(scalarKey(pointsA[i]!)).toEqual(scalarKey(pointsB[i]!))
      // Spectrum buffers are Float32 — byte-exactness is the right
      // granularity here (any silent f64→f32 rounding difference would
      // still manifest bit-exactly in f32 storage if the inputs are
      // bit-identical).
      for (const clock of ['a', 'phi1'] as const) {
        const ka = pointsA[i]!.kSpectrumByClock[clock]
        const kb = pointsB[i]!.kSpectrumByClock[clock]
        const ha = pointsA[i]!.hjSpectrumByClock[clock]
        const hb = pointsB[i]!.hjSpectrumByClock[clock]
        // Both clock spectra must be populated Float32Arrays of identical
        // length — a silent undefined on one side would make the bit-exact
        // check below trivially pass.
        expect(ka).toBeInstanceOf(Float32Array)
        expect(kb).toBeInstanceOf(Float32Array)
        expect(ha).toBeInstanceOf(Float32Array)
        expect(hb).toBeInstanceOf(Float32Array)
        expect(ka!.length).toBe(kb!.length)
        expect(ha!.length).toBe(hb!.length)
        expect(Array.from(ka!)).toEqual(Array.from(kb!))
        expect(Array.from(ha!)).toEqual(Array.from(hb!))
      }
    }
  })

  it('sweepPointsToCsv output is byte-identical with computeMs canonicalised', () => {
    const physics = {
      inflatonMass: WDW_INPUT.inflatonMass,
      cosmologicalConstant: WDW_INPUT.cosmologicalConstant,
    }
    const a = runCutSweep({
      solverOutput: solveWheelerDeWitt(WDW_INPUT),
      config: SWEEP_CFG,
      physics,
    }).map(canonicalize)
    const b = runCutSweep({
      solverOutput: solveWheelerDeWitt(WDW_INPUT),
      config: SWEEP_CFG,
      physics,
    }).map(canonicalize)
    const csvA = sweepPointsToCsv(a, 'cut', [])
    const csvB = sweepPointsToCsv(b, 'cut', [])
    expect(csvA).toBe(csvB)
    // Sanity — the CSV should contain the header and at least one data row.
    expect(csvA).toContain('index,sweepValue')
    expect(csvA.split('\n').length).toBeGreaterThan(3)
  })

  it('reproducibility manifest + CSV is byte-identical given a fixed generatedAt', () => {
    // The full reproducibility contract: manifest + data rows must be
    // byte-exact across two runs so a user can re-export a sweep months
    // later and diff it against the original without noise. `generatedAt`
    // and `computeMs` are the only two non-deterministic fields; both are
    // controlled here by the test (fixed ISO string + canonicalised to 0).
    const wdwConfig = {
      ...DEFAULT_WHEELER_DEWITT_CONFIG,
      boundaryCondition: WDW_INPUT.boundaryCondition,
      inflatonMass: WDW_INPUT.inflatonMass,
      cosmologicalConstant: WDW_INPUT.cosmologicalConstant,
      aMin: WDW_INPUT.aMin,
      aMax: WDW_INPUT.aMax,
      gridNa: WDW_INPUT.gridNa,
      gridNphi: WDW_INPUT.gridNphi,
      phiExtent: WDW_INPUT.phiExtent,
    }
    const physics = {
      inflatonMass: WDW_INPUT.inflatonMass,
      cosmologicalConstant: WDW_INPUT.cosmologicalConstant,
    }
    const manifest = buildSrmtSweepManifest({
      wdwConfig,
      srmtConfig: SWEEP_CFG,
      gitSha: 'test-sha',
      wdwSolverVersion: '1.0.0',
      srmtDiagnosticVersion: '1.0.0',
      generatedAt: '2026-04-19T10:00:00.000Z',
    })
    const a = runCutSweep({
      solverOutput: solveWheelerDeWitt(WDW_INPUT),
      config: SWEEP_CFG,
      physics,
    }).map(canonicalize)
    const b = runCutSweep({
      solverOutput: solveWheelerDeWitt(WDW_INPUT),
      config: SWEEP_CFG,
      physics,
    }).map(canonicalize)
    const csvA = sweepPointsToCsv(a, 'cut', [], manifest)
    const csvB = sweepPointsToCsv(b, 'cut', [], manifest)
    expect(csvA).toBe(csvB)
    expect(csvA).toContain('# generated: 2026-04-19T10:00:00.000Z')
    expect(csvA).toContain('# git: test-sha')
  })
})
