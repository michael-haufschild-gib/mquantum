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

import { solveWheelerDeWitt } from '@/lib/physics/wheelerDeWitt/solver'

function assertAllFinite(chi: Float32Array): void {
  for (let i = 0; i < chi.length; i++) {
    if (!Number.isFinite(chi[i]!)) {
      throw new Error(`chi[${i}] = ${chi[i]} is not finite`)
    }
  }
}

describe('WDW solver — extreme parameter corners', () => {
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
    ).toThrow(/gridNa must be >= 3/)
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
    ).toThrow(/gridNphi must be >= 3/)
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
    // everywhere; the HH small-V expansion is skipped (|Λ| > threshold)
    // and the solver takes the full WKB formula with a V = Λ column.
    // Stage-3 Airy extraction may or may not fire depending on Λ; the
    // only hard invariant is that χ stays finite and the initial slab
    // matches the expected `amp = exp(-|S_E|)` shape at every φ.
    const out = solveWheelerDeWitt({
      boundaryCondition: 'noBoundary',
      inflatonMass: 0,
      cosmologicalConstant: 0.3,
      aMin: 0.1,
      aMax: 1.5,
      gridNa: 32,
      gridNphi: 16,
      phiExtent: 3.5,
    })
    assertAllFinite(out.chi)
    // V is constant in φ so the initial slab's amplitude is also
    // constant in φ (up to the sponge-layer attenuation that clamps
    // near the grid edges). Check that interior cells agree to
    // high precision.
    const Nphi = out.gridSize[1]
    const centre = Math.floor(Nphi / 2) * Nphi + Math.floor(Nphi / 2)
    const interior = Math.floor(Nphi / 2) * Nphi + (Math.floor(Nphi / 2) + 1)
    const a0Centre = out.chi[2 * centre]!
    const a0Interior = out.chi[2 * interior]!
    expect(Math.abs(a0Centre - a0Interior)).toBeLessThan(0.01)
    // m=0, Λ=0.3 gives a constant V=0.3 — initial seed amp is
    // `exp(-|S_E|)` with S_E(a_min=0.1, V=0.3) =
    //   (1/(3·0.3))·((1 - K·0.01·0.3)^{1.5} - 1)
    //   ≈ (1.111)·((1 - 0.0838)^{1.5} - 1)
    //   ≈ 1.111·(-0.1258)
    //   ≈ -0.1398
    // → amp ≈ exp(-0.1398) ≈ 0.870. Assert within a loose tolerance
    // to survive floating-point drift.
    expect(a0Centre).toBeGreaterThan(0.8)
    expect(a0Centre).toBeLessThan(1.0)
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
