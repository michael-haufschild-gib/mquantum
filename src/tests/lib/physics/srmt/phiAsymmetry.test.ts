/**
 * Tests for the Wheeler–DeWitt φ-axis mass-asymmetry symmetry break.
 *
 * Hypothesis under test: with the symmetric potential
 * `V(φ₁, φ₂) = ½m²(φ₁² + φ₂²) + Λ` the Schmidt decomposition of `χ`
 * along the `φ₁` axis is identical to that along the `φ₂` axis, so
 * `kSpectrum(phi1) == kSpectrum(phi2)` and the SRMT three-clock test
 * collapses to two independent readings (redundant `phi2`). Introducing
 * a per-axis asymmetry `α ≠ 1` breaks this exchange symmetry and the
 * two φ-clock spectra diverge — which is the thesis-grade discriminator
 * required by `docs/physics/srmt-metric.md`.
 *
 * @module tests/lib/physics/srmt/phiAsymmetry
 */

import { describe, expect, it } from 'vitest'

import { modularSpectrum } from '@/lib/physics/srmt/modularHamiltonian'
import { computeVolumeElement, normalizedSchmidtValues } from '@/lib/physics/srmt/schmidt'
import { solveWheelerDeWitt } from '@/lib/physics/wheelerDeWitt/solver'

/**
 * Compact solver config. Small enough to run in milliseconds, large
 * enough that the Schmidt + modular spectrum has enough dynamic range
 * for an `≥ 1e-3` differential to be meaningful.
 */
const BASE = {
  boundaryCondition: 'noBoundary' as const,
  inflatonMass: 0.3,
  cosmologicalConstant: 0.05,
  aMin: 0.1,
  aMax: 1.5,
  gridNa: 48,
  gridNphi: 16,
  phiExtent: 2.0,
}

describe('Wheeler–DeWitt inflatonMassAsymmetry — Schmidt / modular spectra', () => {
  it('symmetric baseline: kSpectrum(phi1) equals kSpectrum(phi2) within FP noise', () => {
    // Control test. The existing isotropic potential is exchange-symmetric
    // under φ₁ ↔ φ₂, so the Schmidt singular values along each axis must
    // match up to SVD round-off (~1e-6 for Float64 accumulation on this
    // grid size). If this test ever fails, something has silently broken
    // the φ-symmetry of the solver at α = 1.
    const out = solveWheelerDeWitt({ ...BASE, inflatonMassAsymmetry: 1 })
    const dVol = computeVolumeElement({
      gridSize: out.gridSize,
      aMin: out.aMin,
      aMax: out.aMax,
      phiExtent: out.phiExtent,
    })
    const sPhi1 = normalizedSchmidtValues({ chi: out.chi, gridSize: out.gridSize }, 'phi1', dVol)
    const sPhi2 = normalizedSchmidtValues({ chi: out.chi, gridSize: out.gridSize }, 'phi2', dVol)
    const k1 = modularSpectrum(sPhi1).spectrum
    const k2 = modularSpectrum(sPhi2).spectrum
    const compareCount = Math.min(k1.length, k2.length, 8)
    for (let i = 0; i < compareCount; i++) {
      expect(Math.abs(k1[i]! - k2[i]!)).toBeLessThan(1e-4)
    }
  })

  it('asymmetric potential (α = 2): kSpectrum(phi1) and kSpectrum(phi2) differ on first 8 modes', () => {
    // At α = 2 the φ₂ axis carries effective mass 2m. The resulting χ
    // has a narrower φ₂-Gaussian envelope than φ₁-Gaussian, so the
    // Schmidt singular values along phi1 pick up more of the spread
    // from the axis that still has the original mass, while phi2 sees
    // the stiffer spectrum from the heavy axis. The modular K_n =
    // −log(s_n² + ε) must therefore diverge between the two clocks on
    // at least one of the first 8 modes by ≥ 1e-3 — well above the
    // ~1e-4 FP floor from the symmetric baseline.
    const out = solveWheelerDeWitt({ ...BASE, inflatonMassAsymmetry: 2.0 })
    const dVol = computeVolumeElement({
      gridSize: out.gridSize,
      aMin: out.aMin,
      aMax: out.aMax,
      phiExtent: out.phiExtent,
    })
    const sPhi1 = normalizedSchmidtValues({ chi: out.chi, gridSize: out.gridSize }, 'phi1', dVol)
    const sPhi2 = normalizedSchmidtValues({ chi: out.chi, gridSize: out.gridSize }, 'phi2', dVol)
    const k1 = modularSpectrum(sPhi1).spectrum
    const k2 = modularSpectrum(sPhi2).spectrum
    const compareCount = Math.min(k1.length, k2.length, 8)
    expect(compareCount).toBeGreaterThan(0)
    let maxDiff = 0
    let diffCount = 0
    for (let i = 0; i < compareCount; i++) {
      const d = Math.abs(k1[i]! - k2[i]!)
      if (d > maxDiff) maxDiff = d
      if (d >= 1e-3) diffCount += 1
    }
    expect(maxDiff).toBeGreaterThanOrEqual(1e-3)
    expect(diffCount).toBeGreaterThanOrEqual(1)
  })

  it('asymmetric potential (α = 2): α = 1 and α = 2 give distinct modular spectra', () => {
    // Sanity check that the asymmetry knob actually threads into the
    // solver (not just into the HJ operator). The isotropic χ and the
    // α = 2 χ must produce different Schmidt-derived modular spectra.
    const symOut = solveWheelerDeWitt({ ...BASE, inflatonMassAsymmetry: 1 })
    const asymOut = solveWheelerDeWitt({ ...BASE, inflatonMassAsymmetry: 2 })
    const dVolSym = computeVolumeElement({
      gridSize: symOut.gridSize,
      aMin: symOut.aMin,
      aMax: symOut.aMax,
      phiExtent: symOut.phiExtent,
    })
    const dVolAsym = computeVolumeElement({
      gridSize: asymOut.gridSize,
      aMin: asymOut.aMin,
      aMax: asymOut.aMax,
      phiExtent: asymOut.phiExtent,
    })
    const sSym = normalizedSchmidtValues(
      { chi: symOut.chi, gridSize: symOut.gridSize },
      'phi2',
      dVolSym
    )
    const sAsym = normalizedSchmidtValues(
      { chi: asymOut.chi, gridSize: asymOut.gridSize },
      'phi2',
      dVolAsym
    )
    const kSym = modularSpectrum(sSym).spectrum
    const kAsym = modularSpectrum(sAsym).spectrum
    const compareCount = Math.min(kSym.length, kAsym.length, 8)
    let maxDiff = 0
    for (let i = 0; i < compareCount; i++) {
      const d = Math.abs(kSym[i]! - kAsym[i]!)
      if (d > maxDiff) maxDiff = d
    }
    expect(maxDiff).toBeGreaterThanOrEqual(1e-3)
  })
})
