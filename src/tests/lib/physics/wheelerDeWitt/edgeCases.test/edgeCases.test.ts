/**
 * Wheeler–DeWitt solver edge-case robustness tests.
 *
 * Covers parameter combinations that sit at the extreme corners of the
 * configuration space — minimum grid sizes, near-zero `aMin`, extreme
 * cosmological constants, mass-asymmetry extremes, and off-grid turning
 * surfaces. Every one of these triggers a code path that silently
 * regresses when refactoring the leapfrog, Airy connection, or sponge
 * layer, because the "happy-path" unit tests use the comfortable
 * default grid (Na=128, Nphi=40, phiExtent=3.5). Breakage at the
 * extremes manifests as NaN / Infinity contamination, zero output, or
 * unbounded max-density — each of those we assert against here.
 */

import { describe, expect, it } from 'vitest'

import { hhLangerSeed } from '@/lib/physics/wheelerDeWitt/hhLangerSeed'
import { solveWheelerDeWitt } from '@/lib/physics/wheelerDeWitt/solver'
import {
  resetCflWarningBudget,
  WDW_CFL_WARN_BUDGET,
} from '@/lib/physics/wheelerDeWitt/solverConstants'
import type { WheelerDeWittSolverInput } from '@/lib/physics/wheelerDeWitt/solverTypes'

function assertAllFinite(chi: Float32Array): void {
  for (let i = 0; i < chi.length; i++) {
    if (!Number.isFinite(chi[i]!)) {
      throw new Error(`chi[${i}] = ${chi[i]} is not finite`)
    }
  }
}

describe('WDW solver — extreme parameter corners', () => {
  const VALID_INPUT: WheelerDeWittSolverInput = {
    boundaryCondition: 'noBoundary',
    inflatonMass: 0.3,
    cosmologicalConstant: 0.0,
    aMin: 0.1,
    aMax: 1.5,
    gridNa: 8,
    gridNphi: 4,
    phiExtent: 3.5,
  }

  it('handles gridNa = 3 minimum without crash', () => {
    const out = solveWheelerDeWitt({
      boundaryCondition: 'noBoundary',
      inflatonMass: 0.3,
      cosmologicalConstant: 0.0,
      aMin: 0.1,
      aMax: 1.5,
      gridNa: 3,
      gridNphi: 8,
      phiExtent: 3.5,
    })
    expect(out.gridSize[0]).toBe(3)
    assertAllFinite(out.chi)
    expect(Number.isFinite(out.maxDensity)).toBe(true)
  })

  it('handles gridNphi = 3 minimum without crash', () => {
    const out = solveWheelerDeWitt({
      boundaryCondition: 'tunneling',
      inflatonMass: 0.3,
      cosmologicalConstant: 0.3,
      aMin: 0.1,
      aMax: 1.5,
      gridNa: 16,
      gridNphi: 3,
      phiExtent: 3.5,
    })
    expect(out.gridSize[1]).toBe(3)
    expect(out.gridSize[2]).toBe(3)
    assertAllFinite(out.chi)
  })

  it('rejects gridNa < 3 with a clear error', () => {
    expect(() =>
      solveWheelerDeWitt({
        boundaryCondition: 'noBoundary',
        inflatonMass: 0.3,
        cosmologicalConstant: 0.0,
        aMin: 0.1,
        aMax: 1.5,
        gridNa: 2,
        gridNphi: 8,
        phiExtent: 3.5,
      })
    ).toThrow(/gridNa must be an integer >= 3/)
  })

  it('rejects gridNphi < 3 with a clear error', () => {
    expect(() =>
      solveWheelerDeWitt({
        boundaryCondition: 'deWitt',
        inflatonMass: 0.3,
        cosmologicalConstant: 0.0,
        aMin: 0.1,
        aMax: 1.5,
        gridNa: 32,
        gridNphi: 2,
        phiExtent: 3.5,
      })
    ).toThrow(/gridNphi must be an integer >= 3/)
  })

  it('rejects aMax ≤ aMin', () => {
    expect(() =>
      solveWheelerDeWitt({
        boundaryCondition: 'noBoundary',
        inflatonMass: 0.3,
        cosmologicalConstant: 0.0,
        aMin: 1.0,
        aMax: 1.0,
        gridNa: 32,
        gridNphi: 8,
        phiExtent: 3.5,
      })
    ).toThrow(/aMax must exceed aMin/)
  })

  it.each([
    [
      'unknown boundary condition',
      { boundaryCondition: 'bogus' },
      /boundaryCondition must be one of/,
    ],
    ['NaN mass', { inflatonMass: Number.NaN }, /inflatonMass must be finite/],
    ['negative mass', { inflatonMass: -0.1 }, /inflatonMass must be >= 0/],
    ['too-large mass', { inflatonMass: 2.1 }, /inflatonMass must be <= 2/],
    [
      'non-finite cosmological constant',
      { cosmologicalConstant: Number.POSITIVE_INFINITY },
      /cosmologicalConstant must be finite/,
    ],
    [
      'too-large cosmological constant',
      { cosmologicalConstant: 1.1 },
      /cosmologicalConstant must be <= 1/,
    ],
    [
      'too-negative cosmological constant',
      { cosmologicalConstant: -1.1 },
      /cosmologicalConstant must be >= -1/,
    ],
    ['too-small aMin', { aMin: 0.01 }, /aMin must be >= 0.05/],
    ['zero aMin', { aMin: 0 }, /aMin must be >= 0.05/],
    ['too-small a span', { aMax: 0.1000001 }, /aMax must exceed aMin by at least 0.000001/],
    ['too-large aMax', { aMax: 10.1 }, /aMax must be <= 10/],
    ['non-finite aMax', { aMax: Number.NEGATIVE_INFINITY }, /aMax must be finite/],
    ['fractional gridNa', { gridNa: 3.5 }, /gridNa must be an integer >= 3/],
    ['fractional gridNphi', { gridNphi: 3.5 }, /gridNphi must be an integer >= 3/],
    ['too-large gridNa', { gridNa: 1025 }, /gridNa must be an integer >= 3 and <= 1024/],
    ['too-large gridNphi', { gridNphi: 129 }, /gridNphi must be an integer >= 3 and <= 128/],
    ['too-small phiExtent', { phiExtent: 0.1 }, /phiExtent must be >= 0.5/],
    ['zero phiExtent', { phiExtent: 0 }, /phiExtent must be >= 0.5/],
    ['too-large phiExtent', { phiExtent: 10.1 }, /phiExtent must be <= 10/],
    [
      'too-small inflatonMassAsymmetry',
      { inflatonMassAsymmetry: 0.05 },
      /inflatonMassAsymmetry must be >= 0.1/,
    ],
    [
      'too-large inflatonMassAsymmetry',
      { inflatonMassAsymmetry: 10.1 },
      /inflatonMassAsymmetry must be <= 10/,
    ],
  ])('rejects invalid public input: %s', (_name, override, message) => {
    expect(() =>
      solveWheelerDeWitt({
        ...VALID_INPUT,
        ...(override as Partial<WheelerDeWittSolverInput>),
      })
    ).toThrow(message)
  })

  it('rejects non-finite custom boundary buffers before propagation', () => {
    const chi = new Float32Array(2 * VALID_INPUT.gridNphi * VALID_INPUT.gridNphi)
    const chiDeriv = new Float32Array(chi.length)
    chi[3] = Number.NaN

    expect(() =>
      solveWheelerDeWitt({
        ...VALID_INPUT,
        customBoundary: { chi, chiDeriv },
      })
    ).toThrow(/customBoundary\.chi\[3\] must be finite/)
  })

  it('clamps non-finite CFL warning reset budgets to zero', () => {
    resetCflWarningBudget(Number.POSITIVE_INFINITY)
    expect(WDW_CFL_WARN_BUDGET.remaining).toBe(0)

    resetCflWarningBudget(Number.NaN)
    expect(WDW_CFL_WARN_BUDGET.remaining).toBe(0)

    resetCflWarningBudget()
    expect(WDW_CFL_WARN_BUDGET.remaining).toBe(3)
  })

  it('remains finite at Λ = +1 (upper clamp edge, large dS Euclidean growth)', () => {
    const out = solveWheelerDeWitt({
      boundaryCondition: 'tunneling',
      inflatonMass: 0.3,
      cosmologicalConstant: 1.0,
      aMin: 0.1,
      aMax: 1.5,
      gridNa: 64,
      gridNphi: 16,
      phiExtent: 3.5,
    })
    assertAllFinite(out.chi)
    expect(out.maxDensity).toBeGreaterThan(0)
  })

  it('remains finite at Λ = −1 (lower clamp edge, AdS-like V < 0 bulk)', () => {
    const out = solveWheelerDeWitt({
      boundaryCondition: 'tunneling',
      inflatonMass: 0.3,
      cosmologicalConstant: -1.0,
      aMin: 0.1,
      aMax: 1.5,
      gridNa: 64,
      gridNphi: 16,
      phiExtent: 3.5,
    })
    assertAllFinite(out.chi)
    expect(out.maxDensity).toBeGreaterThan(0)
  })

  it('remains finite at inflatonMassAsymmetry = 0.1 (φ₂ almost massless)', () => {
    const out = solveWheelerDeWitt({
      boundaryCondition: 'noBoundary',
      inflatonMass: 0.3,
      inflatonMassAsymmetry: 0.1,
      cosmologicalConstant: 0.0,
      aMin: 0.1,
      aMax: 1.5,
      gridNa: 64,
      gridNphi: 16,
      phiExtent: 3.5,
    })
    assertAllFinite(out.chi)
  })

  it('remains finite at inflatonMassAsymmetry = 10 (φ₂ 10× stiffer)', () => {
    const out = solveWheelerDeWitt({
      boundaryCondition: 'noBoundary',
      inflatonMass: 0.3,
      inflatonMassAsymmetry: 10,
      cosmologicalConstant: 0.0,
      aMin: 0.1,
      aMax: 1.5,
      gridNa: 64,
      gridNphi: 16,
      phiExtent: 3.5,
    })
    assertAllFinite(out.chi)
  })

  it('remains finite at inflatonMass = 0 (free-kinetic regime)', () => {
    const out = solveWheelerDeWitt({
      boundaryCondition: 'noBoundary',
      inflatonMass: 0,
      cosmologicalConstant: 0.0,
      aMin: 0.1,
      aMax: 1.5,
      gridNa: 64,
      gridNphi: 16,
      phiExtent: 3.5,
    })
    assertAllFinite(out.chi)
    // Free regime: the Hartle-Hawking gauge choice is a static
    // Gaussian envelope — check the peak lies on the φ=0 seed cell.
    const Nphi = out.gridSize[1]
    const centre = Math.floor(Nphi / 2) * Nphi + Math.floor(Nphi / 2)
    const re0 = out.chi[2 * centre]!
    expect(Math.abs(re0)).toBeGreaterThan(0)
  })

  it('keeps deWitt origin node non-degenerate at small aMin', () => {
    // At aMin=0.05 the DeWitt bootstrap sets χ(aMin) = aMin·env →
    // peak ≈ 0.05. Solver should NOT zero this out via leapfrog noise.
    const out = solveWheelerDeWitt({
      boundaryCondition: 'deWitt',
      inflatonMass: 0.3,
      cosmologicalConstant: 0.0,
      aMin: 0.05,
      aMax: 0.5,
      gridNa: 64,
      gridNphi: 16,
      phiExtent: 3.5,
    })
    assertAllFinite(out.chi)
    // The seed slab peaks at ≈ aMin; the leapfrog's subsequent slabs
    // should preserve non-zero amplitudes (otherwise DeWitt presets
    // render as black).
    expect(out.maxDensity).toBeGreaterThan(1e-6)
  })

  it('handles m = 0 with Λ > 0 (constant-V free-with-Λ regime)', () => {
    // Degenerate but physically meaningful: no inflaton mass so V(φ) = Λ
    // everywhere. The Phase 2 HH seed produces a φ-independent slab
    // (V = Λ = const → χ(a_min, φ) = (ζ/U)^{1/4}·Ai(ζ) same for every
    // cell) — the constant-in-φ property is the load-bearing invariant.
    const params = {
      boundaryCondition: 'noBoundary' as const,
      inflatonMass: 0,
      cosmologicalConstant: 0.3,
      aMin: 0.1,
      aMax: 1.5,
      gridNa: 32,
      gridNphi: 16,
      phiExtent: 3.5,
    }
    const out = solveWheelerDeWitt(params)
    assertAllFinite(out.chi)
    // V is constant in φ so the initial slab must be constant in φ. Check
    // interior cells (sponge-free).
    const Nphi = out.gridSize[1]
    const centre = Math.floor(Nphi / 2) * Nphi + Math.floor(Nphi / 2)
    const interior = Math.floor(Nphi / 2) * Nphi + (Math.floor(Nphi / 2) + 1)
    const a0Centre = out.chi[2 * centre]!
    const a0Interior = out.chi[2 * interior]!
    // Langer-Ai seed magnitude for this config is O(0.01) (near a first
    // Ai-zero at this ζ); absolute tolerance 1e-4 preserves the
    // constant-in-φ invariant without over-constraining magnitude.
    expect(Math.abs(a0Centre - a0Interior)).toBeLessThan(1e-4)
    // Seed value matches the Langer-Ai reference at the grid centre.
    const ref = hhLangerSeed({
      a: params.aMin,
      phi1: 0,
      phi2: 0,
      m: params.inflatonMass,
      lambda: params.cosmologicalConstant,
    })
    expect(a0Centre).toBeCloseTo(ref.chi.re, 5)
  })

  it('handles m = 0 with Λ < 0 (free-kinetic AdS regime)', () => {
    // m = 0 AND Λ < 0 hits the isAdsCase branch (lambda < 0), so the
    // HH boundary generator uses the Gaussian envelope. Evolution in
    // the Lorentzian-only a-range must stay finite.
    const out = solveWheelerDeWitt({
      boundaryCondition: 'noBoundary',
      inflatonMass: 0,
      cosmologicalConstant: -0.2,
      aMin: 0.1,
      aMax: 1.5,
      gridNa: 32,
      gridNphi: 16,
      phiExtent: 3.5,
    })
    assertAllFinite(out.chi)
    expect(out.maxDensity).toBeGreaterThan(0)
  })

  it('produces bandKind values in {0, 1, 2} for every cell', () => {
    const out = solveWheelerDeWitt({
      boundaryCondition: 'tunneling',
      inflatonMass: 0.3,
      cosmologicalConstant: 0.3,
      aMin: 0.1,
      aMax: 1.5,
      gridNa: 32,
      gridNphi: 8,
      phiExtent: 3.5,
    })
    for (let i = 0; i < out.bandKind.length; i++) {
      const b = out.bandKind[i]!
      if (b < 0 || b > 2) {
        throw new Error(`bandKind[${i}] = ${b} is out of range`)
      }
    }
  })
})
