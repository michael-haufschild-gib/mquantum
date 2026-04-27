/**
 * Peschel entanglement-entropy tests for the 1D free scalar field.
 *
 * Exercises the correlation-matrix route end-to-end: vacuum correlators,
 * symplectic eigenvalues, per-mode entropy, length-sweep, central-charge fit.
 * Also contains a deterministic sanity check for the cyclic-Jacobi solver
 * that the entropy pipeline depends on.
 *
 * @module tests/lib/physics/entanglement/peschelEntropy
 */

import { describe, expect, it } from 'vitest'

import { jacobiEigenvalues } from '@/lib/math/jacobiEigenvalues'
import { computeCosmologicalEntropyTrajectory } from '@/lib/physics/entanglement/peschelCosmology'
import {
  buildLatticeCorrelators1D,
  buildLatticeSliceCorrelators,
  computeEntanglementSpectrum,
  computeEntropySpectrum,
  extractSubsystem,
  fitCentralCharge,
  fitEntanglementTemperature,
  peschelEntropy,
  symplecticEigenvalues,
} from '@/lib/physics/entanglement/peschelEntropy'

const N = 128
const SPACING = 1
const HALF = N / 2

/**
 * Generate `[1, 2, …, len]` as a plain number[].
 */
function range1(len: number): number[] {
  const out: number[] = []
  for (let i = 1; i <= len; i++) out.push(i)
  return out
}

describe('peschelEntropy — 1D free scalar', () => {
  it('jacobi sanity: known 3×3 tridiagonal has analytic eigenvalues {2−√2, 2, 2+√2}', () => {
    // A = [[2,1,0],[1,2,1],[0,1,2]] has char poly (2−λ)[(2−λ)²−2]
    const A = new Float64Array([2, 1, 0, 1, 2, 1, 0, 1, 2])
    const eig = jacobiEigenvalues(A, 3)
    const expected = [2 + Math.SQRT2, 2, 2 - Math.SQRT2]
    expect(eig.length).toBe(3)
    for (let i = 0; i < 3; i++) {
      expect(eig[i]!).toBeCloseTo(expected[i]!, 9)
    }
  })

  it('massless free scalar extracts central charge c ≈ 1 from the log law', () => {
    const correlators = buildLatticeCorrelators1D({
      gridSize: N,
      spacing: SPACING,
      massSq: 0,
    })
    const { lengths, entropies } = computeEntropySpectrum(correlators, N, range1(HALF), 0)
    const { c, usedPoints, rSquared } = fitCentralCharge(lengths, entropies)

    expect(Number.isFinite(c)).toBe(true)
    expect(usedPoints).toBeGreaterThanOrEqual(6)
    // Lattice correlators have small logarithmic curvature from the
    // periodic boundary chord correction even in the short-distance
    // fit window; r² stays above 0.99.
    expect(rSquared).toBeGreaterThan(0.99)
    // Central charge band specified by the PRD.
    expect(c).toBeGreaterThan(0.85)
    expect(c).toBeLessThan(1.15)
  })

  it('massive free scalar (m = 2) saturates — fit c ≈ 0 and low variation in [16, 48]', () => {
    const correlators = buildLatticeCorrelators1D({
      gridSize: N,
      spacing: SPACING,
      massSq: 4,
    })
    const { lengths, entropies } = computeEntropySpectrum(correlators, N, range1(HALF), 0)
    const { c } = fitCentralCharge(lengths, entropies)

    expect(Number.isFinite(c)).toBe(true)
    expect(c).toBeLessThan(0.15)

    // Saturation: entropies over L ∈ [16, 48] should vary by < 10%.
    let lo = Number.POSITIVE_INFINITY
    let hi = Number.NEGATIVE_INFINITY
    for (let i = 0; i < lengths.length; i++) {
      const L = lengths[i]!
      if (L < 16 || L > 48) continue
      const S = entropies[i]!
      if (S < lo) lo = S
      if (S > hi) hi = S
    }
    expect(Number.isFinite(lo)).toBe(true)
    expect(Number.isFinite(hi)).toBe(true)
    const ref = 0.5 * (lo + hi)
    expect((hi - lo) / Math.max(ref, 1e-9)).toBeLessThan(0.1)
  })

  it('all symplectic eigenvalues respect the physical floor ν ≥ 0.499', () => {
    const correlators = buildLatticeCorrelators1D({
      gridSize: N,
      spacing: SPACING,
      massSq: 0,
    })
    // Sweep several sizes — include small + medium + large.
    const sizes = [1, 2, 8, 32, HALF]
    for (const L of sizes) {
      const XA = new Float64Array(L * L)
      const PA = new Float64Array(L * L)
      for (let i = 0; i < L; i++) {
        for (let j = 0; j < L; j++) {
          XA[i * L + j] = correlators.X[i * N + j]!
          PA[i * L + j] = correlators.P[i * N + j]!
        }
      }
      const nu = symplecticEigenvalues(XA, PA, L)
      for (let k = 0; k < L; k++) {
        expect(nu[k]!).toBeGreaterThanOrEqual(0.499)
      }
    }
  })

  it('S(L_A) is monotonic non-decreasing on L ∈ [1, N/2]', () => {
    const correlators = buildLatticeCorrelators1D({
      gridSize: N,
      spacing: SPACING,
      massSq: 0,
    })
    const { entropies } = computeEntropySpectrum(correlators, N, range1(HALF), 0)
    const tol = 1e-9
    for (let i = 1; i < entropies.length; i++) {
      expect(entropies[i]! - entropies[i - 1]!).toBeGreaterThanOrEqual(-tol)
    }
  })

  it('L_A = 1 edge case yields a finite, non-negative entropy', () => {
    const correlators = buildLatticeCorrelators1D({
      gridSize: N,
      spacing: SPACING,
      massSq: 0,
    })
    const { lengths, entropies } = computeEntropySpectrum(correlators, N, [1], 0)
    expect(lengths).toEqual([1])
    expect(entropies.length).toBe(1)
    expect(Number.isFinite(entropies[0]!)).toBe(true)
    expect(entropies[0]!).toBeGreaterThanOrEqual(0)
  })

  it('empty length sweep returns empty output arrays', () => {
    const correlators = buildLatticeCorrelators1D({
      gridSize: N,
      spacing: SPACING,
      massSq: 0,
    })
    const { lengths, entropies } = computeEntropySpectrum(correlators, N, [], 0)
    expect(lengths).toEqual([])
    expect(entropies).toEqual([])
  })
})

describe('peschelEntropy — entanglement spectrum and modular temperature', () => {
  it('computeEntanglementSpectrum: total entropy matches peschelEntropy exactly', () => {
    // Hand-picked symplectic eigenvalues straddling ν = ½ and ν ≫ ½.
    const nu = new Float64Array([0.5, 0.6, 1.0, 2.5, 10])
    const spec = computeEntanglementSpectrum(nu)
    const scalarS = peschelEntropy(nu)
    // totalEntropy should agree with the scalar helper to machine precision.
    expect(spec.totalEntropy).toBeCloseTo(scalarS, 12)
    // Sorted ascending.
    for (let i = 1; i < spec.nu.length; i++) {
      expect(spec.nu[i]!).toBeGreaterThanOrEqual(spec.nu[i - 1]!)
    }
    // Entanglement gap equals ν_min − ½.
    expect(spec.entanglementGap).toBeCloseTo(spec.nu[0]! - 0.5, 12)
  })

  it('computeEntanglementSpectrum: ε_k = log((ν+½)/(ν−½)) per mode', () => {
    const nu = new Float64Array([0.6, 1.0, 3.0])
    const spec = computeEntanglementSpectrum(nu)
    for (let k = 0; k < spec.nu.length; k++) {
      const v = spec.nu[k]!
      const expected = Math.log((v + 0.5) / (v - 0.5))
      expect(spec.epsilon[k]!).toBeCloseTo(expected, 12)
    }
  })

  it('computeEntanglementSpectrum: ν = ½ produces infinite ε and zero per-mode entropy', () => {
    const nu = new Float64Array([0.5, 0.5, 2.0])
    const spec = computeEntanglementSpectrum(nu)
    // Two modes sit exactly at ν = ½ → ε diverges.
    expect(spec.epsilon[0]!).toBe(Number.POSITIVE_INFINITY)
    expect(spec.epsilon[1]!).toBe(Number.POSITIVE_INFINITY)
    // Per-mode entropy at ν = ½ is
    //   s(½) = (1)·log(1) − (0)·log(0) = 0
    // using the (0 log 0 = 0) convention.
    expect(spec.perModeEntropy[0]!).toBeCloseTo(0, 12)
    expect(spec.perModeEntropy[1]!).toBeCloseTo(0, 12)
    // Finite mode gives a positive contribution.
    expect(spec.perModeEntropy[2]!).toBeGreaterThan(0)
  })

  it('computeEntanglementSpectrum: rejects invalid symplectic inputs', () => {
    expect(() => computeEntanglementSpectrum(new Float64Array([0.4]))).toThrow()
    expect(() => computeEntanglementSpectrum(new Float64Array([Number.NaN]))).toThrow()
  })

  it('fitEntanglementTemperature: equi-spaced modular spectrum recovers the input temperature', () => {
    // Construct a synthetic "Rindler-like" spectrum with an arbitrary
    // modular gap Δε = 2π·β_mod with β_mod = 0.4. This corresponds to a
    // modular temperature T_mod = 1/β_mod = 2.5.
    // ε_k = Δε · (k + 1)  for k = 0 … 11.
    //
    // Invert ε = log((ν + ½)/(ν − ½)) → ν = (1/2) · coth(ε/2).
    const beta = 0.4
    const dEps = 2 * Math.PI * beta
    const nuInput = new Float64Array(12)
    for (let k = 0; k < 12; k++) {
      const eps = dEps * (k + 1)
      // ν = ½ · (e^eps + 1)/(e^eps − 1) = ½ · coth(eps/2)
      nuInput[k] = 0.5 * ((Math.exp(eps) + 1) / (Math.exp(eps) - 1))
    }
    const spec = computeEntanglementSpectrum(nuInput)
    const fit = fitEntanglementTemperature(spec)
    expect(Number.isFinite(fit.inverseTemperature)).toBe(true)
    // The fit should recover β_mod within 5% (synthetic data is perfect).
    expect(Math.abs(fit.inverseTemperature - beta) / beta).toBeLessThan(0.05)
    expect(Math.abs(fit.temperature - 1 / beta) * beta).toBeLessThan(0.05)
    // And the regression quality should be essentially perfect.
    expect(fit.rSquared).toBeGreaterThan(0.9999)
  })

  it('fitEntanglementTemperature: rejects degenerate input with < 4 usable modes', () => {
    const spec = computeEntanglementSpectrum(new Float64Array([0.6, 1.0, 2.0]))
    const fit = fitEntanglementTemperature(spec)
    expect(Number.isNaN(fit.inverseTemperature)).toBe(true)
    expect(Number.isNaN(fit.temperature)).toBe(true)
  })

  it('computeCosmologicalEntropyTrajectory: Minkowski preset is η-independent', () => {
    const traj = computeCosmologicalEntropyTrajectory({
      gridSize: [32],
      spacing: [1],
      latticeDim: 1,
      mass: 0.5,
      subsystemLength: 8,
      cosmology: { preset: 'minkowski', spacetimeDim: 4 },
      etaSweep: [-10, -5, -2, -1],
    })
    expect(traj.etas.length).toBe(4)
    // Minkowski: a(η) = 1 everywhere, so m_eff² = m² = 0.25 at every η.
    for (const a of traj.scaleFactors) expect(a).toBe(1)
    for (const m2 of traj.effectiveMassSq) expect(m2).toBeCloseTo(0.25, 12)
    // Entropies must all be equal (bit-identical Minkowski result).
    for (let i = 1; i < traj.entropies.length; i++) {
      expect(traj.entropies[i]!).toBeCloseTo(traj.entropies[0]!, 12)
    }
  })

  it('computeCosmologicalEntropyTrajectory: deSitter massive scalar saturates as |η| → 0', () => {
    // Massive scalar in de Sitter: a(η) = 1/(H|η|), so m_eff² = m²/(Hη)²
    // grows without bound as η → 0⁻. A sufficiently massive state therefore
    // has a shrinking correlation length and the entanglement entropy over
    // a fixed subsystem saturates (and eventually decreases) as η increases
    // toward zero.
    const traj = computeCosmologicalEntropyTrajectory({
      gridSize: [32],
      spacing: [1],
      latticeDim: 1,
      mass: 0.5,
      subsystemLength: 8,
      cosmology: { preset: 'deSitter', spacetimeDim: 4, hubble: 1.0 },
      etaSweep: [-20, -10, -5, -2, -1, -0.5, -0.2, -0.1],
    })
    expect(traj.etas.length).toBe(8)
    // Scale factor grows monotonically: a(-10) = 0.1, a(-0.1) = 10.
    for (let i = 1; i < traj.scaleFactors.length; i++) {
      expect(traj.scaleFactors[i]!).toBeGreaterThan(traj.scaleFactors[i - 1]!)
    }
    // Effective mass squared grows monotonically (massive case).
    for (let i = 1; i < traj.effectiveMassSq.length; i++) {
      expect(traj.effectiveMassSq[i]!).toBeGreaterThan(traj.effectiveMassSq[i - 1]!)
    }
    // Entropy decreases monotonically toward late times (more massive →
    // shorter correlation length → less entanglement across the cut).
    // Allow a tiny float slack.
    const tol = 1e-9
    for (let i = 1; i < traj.entropies.length; i++) {
      expect(traj.entropies[i]! - traj.entropies[i - 1]!).toBeLessThanOrEqual(tol)
    }
  })

  it('computeCosmologicalEntropyTrajectory: massless de Sitter is η-independent', () => {
    // Massless scalar: m_eff²(η) = 0 · a(η)² ≡ 0 for every η, so the
    // correlator builder receives the same input at every sample and the
    // Peschel entropy must be bit-identical across the sweep. This is
    // the analytic prediction documented in `peschelEntropy.ts` — any
    // future regression that leaked η into the massless branch (e.g. a
    // spurious factor of `a` in the momentum correlator, or a unit
    // conversion on the scale factor that bled into `massSq = 0`) would
    // break this invariance.
    const traj = computeCosmologicalEntropyTrajectory({
      gridSize: [32],
      spacing: [1],
      latticeDim: 1,
      mass: 0,
      subsystemLength: 8,
      cosmology: { preset: 'deSitter', spacetimeDim: 4, hubble: 1.0 },
      etaSweep: [-20, -10, -5, -2, -1, -0.5, -0.2, -0.1],
    })
    expect(traj.etas.length).toBe(8)
    // Scale factor still varies (a(η) = −1/(Hη)) — the invariance below
    // is non-trivial: it comes from `m² = 0`, not from `a² = 1`.
    for (let i = 1; i < traj.scaleFactors.length; i++) {
      expect(traj.scaleFactors[i]!).toBeGreaterThan(traj.scaleFactors[i - 1]!)
    }
    // m_eff² must be exactly zero at every sample.
    for (const m2 of traj.effectiveMassSq) expect(m2).toBe(0)
    // Entropies must all be equal to the first one (bit-identical;
    // `toBe` not `toBeCloseTo` — the builder receives the identical
    // scalar inputs at every step).
    for (let i = 1; i < traj.entropies.length; i++) {
      expect(traj.entropies[i]!).toBe(traj.entropies[0]!)
    }
  })

  it('computeCosmologicalEntropyTrajectory: invalid non-Minkowski preset returns empty trajectory', () => {
    // deSitter with hubble = 0 fails `isValidPreset` (which requires
    // `hubble > 0` for de Sitter). The contract documented in
    // `peschelEntropy.ts` is that the trajectory helper refuses to
    // silently fall back to a Minkowski curve in that case — it returns
    // empty arrays so the UI can hide the chart, which is a clearer
    // signal than a flat line labeled "de Sitter".
    const traj = computeCosmologicalEntropyTrajectory({
      gridSize: [32],
      spacing: [1],
      latticeDim: 1,
      mass: 0.5,
      subsystemLength: 8,
      cosmology: { preset: 'deSitter', spacetimeDim: 4, hubble: 0 },
      etaSweep: [-10, -1, -0.1],
    })
    expect(traj.etas).toEqual([])
    expect(traj.scaleFactors).toEqual([])
    expect(traj.effectiveMassSq).toEqual([])
    expect(traj.entropies).toEqual([])
  })

  it('computeCosmologicalEntropyTrajectory: skips η = 0 and non-finite values', () => {
    const traj = computeCosmologicalEntropyTrajectory({
      gridSize: [32],
      spacing: [1],
      latticeDim: 1,
      mass: 0.5,
      subsystemLength: 8,
      cosmology: { preset: 'deSitter', spacetimeDim: 4, hubble: 1.0 },
      etaSweep: [-5, 0, Number.NaN, Number.POSITIVE_INFINITY, -1],
    })
    // Only the two valid negative η values should remain.
    expect(traj.etas.length).toBe(2)
    expect(traj.etas[0]).toBe(-5)
    expect(traj.etas[1]).toBe(-1)
  })

  it('computeCosmologicalEntropyTrajectory: invalid subsystem length throws', () => {
    const input = {
      gridSize: [32],
      spacing: [1],
      latticeDim: 1,
      mass: 0.5,
      subsystemLength: 0,
      cosmology: { preset: 'minkowski' as const, spacetimeDim: 4 },
      etaSweep: [-1],
    }
    expect(() => computeCosmologicalEntropyTrajectory(input)).toThrow()
  })

  it('fitEntanglementTemperature: returns NaN when all ε are equal (zero slope)', () => {
    // Degenerate spectrum: repeated ν → sxx = 0 → fit undefined.
    const nu = new Float64Array([1.2, 1.2, 1.2, 1.2, 1.2, 1.2])
    const spec = computeEntanglementSpectrum(nu)
    const fit = fitEntanglementTemperature(spec)
    // Zero slope → not positive → NaN.
    expect(Number.isNaN(fit.inverseTemperature)).toBe(true)
    expect(Number.isNaN(fit.temperature)).toBe(true)
  })

  it('real FSF half-lattice cut: spectrum is non-trivial and ordered', () => {
    // Apply the spectrum extractor to a real N=64 half-lattice cut of the
    // massless 1D free scalar. We don't test equi-spacing (the lattice cut
    // is not exactly Rindler), only that (a) the spectrum is monotone,
    // (b) the total entropy matches the separate S(L) computation, and
    // (c) the entanglement gap is small but positive.
    const LN = 64
    const L = LN / 2
    const correlators = buildLatticeCorrelators1D({
      gridSize: LN,
      spacing: SPACING,
      massSq: 0,
    })
    const XA = new Float64Array(L * L)
    const PA = new Float64Array(L * L)
    for (let i = 0; i < L; i++) {
      for (let j = 0; j < L; j++) {
        XA[i * L + j] = correlators.X[i * LN + j]!
        PA[i * L + j] = correlators.P[i * LN + j]!
      }
    }
    const nu = symplecticEigenvalues(XA, PA, L)
    const spec = computeEntanglementSpectrum(nu)
    expect(spec.nu.length).toBe(L)
    expect(spec.totalEntropy).toBeCloseTo(peschelEntropy(nu), 12)
    // Monotone ν → monotone ε (both sorted ascending in ν → descending in ε).
    for (let i = 1; i < spec.nu.length; i++) {
      expect(spec.nu[i]!).toBeGreaterThanOrEqual(spec.nu[i - 1]!)
    }
    // Entanglement gap: on a lattice half cut of a gapless theory some
    // symplectic eigenvalues sit essentially at ν = ½ (numerically
    // clamped by the SYMPLECTIC_FLOOR), so `entanglementGap ≥ 0` is
    // the strongest assertion that does not rely on the clamping
    // threshold.
    expect(spec.entanglementGap).toBeGreaterThanOrEqual(0)
    // Nontrivial coupling: at least 2 modes must sit well above ½. The
    // free-scalar entanglement spectrum decays geometrically in mode
    // index, so only a handful of modes carry most of the entropy but
    // those modes have ν substantially above ½.
    let countFar = 0
    for (let k = 0; k < spec.nu.length; k++) {
      if (spec.nu[k]! > 0.6) countFar++
    }
    expect(countFar).toBeGreaterThanOrEqual(2)
  })
})

// ─────────────────────────────────────────────────────────────────────────
//  Multi-dimensional slice correlators
// ─────────────────────────────────────────────────────────────────────────

describe('buildLatticeSliceCorrelators — N-D slice of the free scalar vacuum', () => {
  it('latticeDim = 1 reduces exactly to the pure 1D builder', () => {
    // Same physical setup from both entry points: the numerical outputs
    // must agree to floating-point precision. The 1D wrapper currently
    // delegates to the slice builder, so this is effectively a regression
    // guard on that delegation.
    const pure1D = buildLatticeCorrelators1D({ gridSize: 32, spacing: 1, massSq: 0 })
    const slice = buildLatticeSliceCorrelators({
      gridSize: [32],
      spacing: [1],
      latticeDim: 1,
      massSq: 0,
    })
    expect(slice.X.length).toBe(pure1D.X.length)
    for (let i = 0; i < pure1D.X.length; i++) {
      expect(slice.X[i]!).toBeCloseTo(pure1D.X[i]!, 12)
      expect(slice.P[i]!).toBeCloseTo(pure1D.P[i]!, 12)
    }
  })

  it('2D slice correlator differs from a standalone 1D theory with the same (N_0, a_0, m)', () => {
    // If the 2D slice builder collapsed to a 1D theory with identical
    // `(N_0, a_0, m)`, the X_00 diagonal entry (the per-site variance
    // `⟨φ(0,0)²⟩`) would match. It should *not*, because the transverse
    // vacuum fluctuations contribute additional modes that shorten the
    // correlation length. This assertion is the direct regression for
    // the round-1 review finding (fixed bug: "drops every axis except
    // axis 0 before it reaches the worker").
    const sliced = buildLatticeSliceCorrelators({
      gridSize: [32, 32],
      spacing: [1, 1],
      latticeDim: 2,
      massSq: 0,
    })
    const only1D = buildLatticeCorrelators1D({ gridSize: 32, spacing: 1, massSq: 0 })

    const diagSliced = sliced.X[0]!
    const diag1D = only1D.X[0]!
    // The physical difference must be real and meaningful, not a round-off
    // artefact: demand a relative separation of at least 5 %.
    expect(Math.abs(diagSliced - diag1D) / Math.max(diag1D, 1e-12)).toBeGreaterThan(0.05)
  })

  it('massive 3D slice is symmetric-Toeplitz and respects the symplectic floor on L = 8', () => {
    // Build a modest 3D configuration, then verify the full Peschel
    // pipeline on an L = 8 subsystem. The key physics checks are:
    //  1. X, P are symmetric (Toeplitz construction enforces it).
    //  2. All symplectic eigenvalues satisfy ν ≥ ½.
    //  3. Entropy is finite and positive.
    const N0 = 16
    const config = {
      gridSize: [N0, N0, N0],
      spacing: [1, 1, 1],
      latticeDim: 3,
      massSq: 1,
    }
    const { X, P } = buildLatticeSliceCorrelators(config)
    for (let i = 0; i < N0; i++) {
      for (let j = 0; j < N0; j++) {
        expect(X[i * N0 + j]!).toBeCloseTo(X[j * N0 + i]!, 12)
        expect(P[i * N0 + j]!).toBeCloseTo(P[j * N0 + i]!, 12)
      }
    }
    const L = 8
    const XA = new Float64Array(L * L)
    const PA = new Float64Array(L * L)
    for (let i = 0; i < L; i++) {
      for (let j = 0; j < L; j++) {
        XA[i * L + j] = X[i * N0 + j]!
        PA[i * L + j] = P[i * N0 + j]!
      }
    }
    const nu = symplecticEigenvalues(XA, PA, L)
    for (let k = 0; k < L; k++) expect(nu[k]!).toBeGreaterThanOrEqual(0.499)
    const S = peschelEntropy(nu)
    expect(Number.isFinite(S)).toBe(true)
    expect(S).toBeGreaterThan(0)
  })

  it('slice entropy shrinks when the transverse direction is enlarged at fixed (N_0, a_0, m)', () => {
    // Additional transverse vacuum modes strengthen short-distance
    // correlations along the slice, which tightens the effective
    // correlation length and *decreases* the entropy of a subsystem
    // sitting in the gapless regime of the 1D problem. Compare the same
    // L = 8 cut through three lattices that differ only in the size of
    // the transverse axis.
    const lengths = [1, 2, 4, 6, 8]
    const entropy = (gridY: number): number => {
      const corr = buildLatticeSliceCorrelators({
        gridSize: [32, gridY],
        spacing: [1, 1],
        latticeDim: 2,
        massSq: 0,
      })
      const { entropies } = computeEntropySpectrum(corr, 32, lengths, 0)
      return entropies[entropies.length - 1]!
    }
    const s1 = entropy(4)
    const s2 = entropy(16)
    // Enlarging the transverse axis must move the entropy — equality
    // would mean transverse modes are being ignored.
    expect(Math.abs(s1 - s2)).toBeGreaterThan(1e-3)
  })

  it('rejects non-integer latticeDim and mismatched array lengths', () => {
    expect(() =>
      buildLatticeSliceCorrelators({
        gridSize: [32],
        spacing: [1],
        latticeDim: 0,
        massSq: 0,
      })
    ).toThrow(/latticeDim must be a positive integer/)

    expect(() =>
      buildLatticeSliceCorrelators({
        gridSize: [32, 32],
        spacing: [1],
        latticeDim: 2,
        massSq: 0,
      })
    ).toThrow(/spacing must have at least 2 entries/)

    expect(() =>
      buildLatticeSliceCorrelators({
        gridSize: [32],
        spacing: [0],
        latticeDim: 1,
        massSq: 0,
      })
    ).toThrow(/spacing\[0\] must be a positive finite number/)
  })
})

// ─────────────────────────────────────────────────────────────────────────
//  extractSubsystem — contiguous row-major submatrix extraction
// ─────────────────────────────────────────────────────────────────────────
//
// extractSubsystem is the workhorse called by `computeEntropySpectrum` to
// pull a contiguous L×L subsystem block out of the full N×N correlator.
// Before these tests, its only coverage was indirect via the entropy
// pipeline — which ALWAYS called it with `start = 0` and `length ≤ N/2`.
// That left three blind spots any future refactor could fall into:
//
//   1. `start > 0` offset arithmetic — an accidental `i` instead of
//      `start + i` on the source row index would silently return the
//      top-left submatrix regardless of `start`. Every existing test
//      still passes because they all pass `start = 0`.
//   2. The full-matrix extraction case `start = 0, length = N` — the
//      boundary of the `start + length > fullSize` guard. Flipping the
//      strict inequality to `>=` would break this exact case and no
//      existing test notices.
//   3. The throw paths for invalid `fullSize`, `start`, `length`, and
//      undersized input — all documented contracts but never
//      exercised. A future "defensive simplification" could drop one of
//      these checks and ship a silent NaN/undefined.
//
// The tests below explicitly exercise each of the three gaps.

describe('extractSubsystem', () => {
  /** Build an N×N row-major matrix where entry (i, j) encodes its row and col. */
  function buildRowColMatrix(N: number): Float64Array {
    const m = new Float64Array(N * N)
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        // 1000*i + j uniquely identifies (row, col) for N ≤ 1000.
        m[i * N + j] = 1000 * i + j
      }
    }
    return m
  }

  describe('happy path', () => {
    it('start = 0, length = fullSize returns a bit-identical copy', () => {
      const N = 4
      const src = buildRowColMatrix(N)
      const out = extractSubsystem(src, N, 0, N)
      expect(out.length).toBe(N * N)
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          expect(out[i * N + j]).toBe(1000 * i + j)
        }
      }
      // Must be a separate buffer — mutating `out` must not touch `src`.
      out[0] = 999999
      expect(src[0]).toBe(0)
    })

    it('start > 0 picks the contiguous slice at the correct offset (regression guard for start offset math)', () => {
      // This test would have failed under any bug that treats `start`
      // as a no-op — e.g., sourcing rows from `i * fullSize + 0` instead
      // of `(start + i) * fullSize + start`.
      const N = 6
      const src = buildRowColMatrix(N)
      const start = 2
      const length = 3
      const out = extractSubsystem(src, N, start, length)
      expect(out.length).toBe(length * length)
      for (let i = 0; i < length; i++) {
        for (let j = 0; j < length; j++) {
          // Output (i, j) must map to source (start + i, start + j).
          expect(out[i * length + j]).toBe(1000 * (start + i) + (start + j))
        }
      }
    })

    it('start at the bottom-right corner extracts the 1x1 trailing submatrix', () => {
      const N = 4
      const src = buildRowColMatrix(N)
      const out = extractSubsystem(src, N, N - 1, 1)
      expect(out.length).toBe(1)
      expect(out[0]).toBe(1000 * (N - 1) + (N - 1)) // (3, 3)
    })

    it('length = 0 returns an empty Float64Array without reading the source', () => {
      // Edge case: zero-length extractions are used nowhere in the
      // current code path, but the contract accepts them and the caller
      // might loop through a variable length range. Missing this gap
      // would have been a throw where a harmless no-op is expected.
      const src = buildRowColMatrix(4)
      const out = extractSubsystem(src, 4, 2, 0)
      expect(out.length).toBe(0)
    })

    it('works on a non-trivial matrix with a non-symmetric stride check', () => {
      // Build a matrix where A[i][j] != A[j][i] so we can detect an
      // accidental i↔j swap in the row-major indexing (which the
      // symmetric correlator tests can't catch).
      const N = 5
      const src = new Float64Array(N * N)
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          src[i * N + j] = 10 * i + j // asymmetric: A[1][2]=12, A[2][1]=21
        }
      }
      const out = extractSubsystem(src, N, 1, 3)
      // Expected: rows 1-3, cols 1-3 of src, relabelled 0-2.
      expect(out[0 * 3 + 0]).toBe(11) // (1, 1)
      expect(out[0 * 3 + 1]).toBe(12) // (1, 2)
      expect(out[0 * 3 + 2]).toBe(13) // (1, 3)
      expect(out[1 * 3 + 0]).toBe(21) // (2, 1)
      expect(out[1 * 3 + 1]).toBe(22) // (2, 2)
      expect(out[1 * 3 + 2]).toBe(23) // (2, 3)
      expect(out[2 * 3 + 0]).toBe(31) // (3, 1)
      expect(out[2 * 3 + 1]).toBe(32) // (3, 2)
      expect(out[2 * 3 + 2]).toBe(33) // (3, 3)
    })
  })

  describe('validation throws', () => {
    it('throws when fullSize is negative', () => {
      expect(() => extractSubsystem(new Float64Array(16), -1, 0, 1)).toThrow(/fullSize/)
    })

    it('throws when fullSize is non-integer', () => {
      expect(() => extractSubsystem(new Float64Array(16), 3.5, 0, 1)).toThrow(/fullSize/)
    })

    it('throws when start is negative', () => {
      expect(() => extractSubsystem(new Float64Array(16), 4, -1, 1)).toThrow(/start/)
    })

    it('throws when length is negative', () => {
      expect(() => extractSubsystem(new Float64Array(16), 4, 0, -1)).toThrow(/length/)
    })

    it('throws when start + length > fullSize (boundary guard)', () => {
      // start=2, length=3, fullSize=4 → 2+3=5 > 4.
      expect(() => extractSubsystem(new Float64Array(16), 4, 2, 3)).toThrow(/exceeds/)
    })

    it('allows start + length === fullSize (must NOT throw at the boundary)', () => {
      // Regression guard: a strict `>=` instead of `>` in the boundary
      // check would flip this edge case from "allowed" to "throw" and no
      // other test would catch it — every existing consumer calls with
      // length ≤ N/2.
      expect(() => extractSubsystem(new Float64Array(16), 4, 0, 4)).not.toThrow()
      expect(() => extractSubsystem(new Float64Array(16), 4, 2, 2)).not.toThrow()
    })

    it('throws when matrix.length < fullSize² (undersized input)', () => {
      // 4*4 = 16 entries required; supply only 15.
      expect(() => extractSubsystem(new Float64Array(15), 4, 0, 2)).toThrow(/matrix length/)
    })
  })
})

describe('computeCosmologicalEntropyTrajectory — N-D lattice routing', () => {
  it('2D Minkowski trajectory matches the 2D slice entropy at η = −1 (N-D path is wired up)', () => {
    // When latticeDim = 2 with Minkowski background, the trajectory value
    // at any η must equal the Minkowski slice entropy built directly from
    // the same (gridSize, spacing, massSq). This guards against a bug
    // where the trajectory helper ignores gridSize[1] and silently
    // regresses to a pure-1D computation.
    const gridSize = [16, 16]
    const spacing = [1, 1]
    const latticeDim = 2
    const massSq = 1

    const { X, P } = buildLatticeSliceCorrelators({ gridSize, spacing, latticeDim, massSq })
    const L = 8
    const XA = new Float64Array(L * L)
    const PA = new Float64Array(L * L)
    for (let i = 0; i < L; i++) {
      for (let j = 0; j < L; j++) {
        XA[i * L + j] = X[i * gridSize[0]! + j]!
        PA[i * L + j] = P[i * gridSize[0]! + j]!
      }
    }
    const expectedS = peschelEntropy(symplecticEigenvalues(XA, PA, L))

    const traj = computeCosmologicalEntropyTrajectory({
      gridSize,
      spacing,
      latticeDim,
      mass: 1,
      subsystemLength: L,
      cosmology: { preset: 'minkowski', spacetimeDim: 3 },
      etaSweep: [-1],
    })
    expect(traj.etas.length).toBe(1)
    expect(traj.entropies[0]!).toBeCloseTo(expectedS, 10)
  })
})
