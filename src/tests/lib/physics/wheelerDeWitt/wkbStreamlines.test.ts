import { describe, expect, it } from 'vitest'

import { solveWheelerDeWitt } from '@/lib/physics/wheelerDeWitt/solver'
import {
  countEuclideanOverlayLeakage,
  integrateWkbStreamlines,
} from '@/lib/physics/wheelerDeWitt/wkbStreamlines'

describe('WKB streamlines', () => {
  it('keep (almost) all splats inside the Lorentzian region', () => {
    const out = solveWheelerDeWitt({
      boundaryCondition: 'tunneling',
      inflatonMass: 0.3,
      cosmologicalConstant: 0.2,
      aMin: 0.5,
      aMax: 2.0,
      gridNa: 32,
      gridNphi: 16,
      phiExtent: 2.0,
    })
    const overlay = integrateWkbStreamlines(out, {
      density: 6,
      maxSteps: 80,
      splatRadius: 0.35,
    })
    const leakage = countEuclideanOverlayLeakage(overlay, out)
    // The Gaussian splat radius inevitably reaches a few Euclidean neighbors
    // near the horizon; require < 30% leakage (splat radius 0.35 cells).
    // Threshold loosened from 0.25 to 0.30 after the nearest-neighbor
    // rounding fix in sampleArg — integer index lookups now hit denser
    // sheets near the turning surface than the old truncated-index path.
    expect(leakage.fraction).toBeLessThan(0.3)
    // Make sure some streamlines actually ran
    expect(leakage.total).toBeGreaterThan(0)
  })

  it('produce non-zero intensity overlay', () => {
    const out = solveWheelerDeWitt({
      boundaryCondition: 'tunneling',
      inflatonMass: 0.3,
      cosmologicalConstant: 0.2,
      aMin: 0.5,
      aMax: 2.0,
      gridNa: 32,
      gridNphi: 16,
      phiExtent: 2.0,
    })
    const overlay = integrateWkbStreamlines(out, {
      density: 6,
      maxSteps: 40,
      splatRadius: 0.9,
    })
    expect(overlay.maxIntensity).toBeGreaterThan(0)
  })

  it('propagate beyond the seed cell (regression: RK4 stall on fractional indices)', () => {
    // Before the sampleArg rounding fix: rk4Step advanced to fractional
    // coordinates; sampleArg indexed the typed array with non-integer keys,
    // got undefined → 0, collapsed the gradient to zero, and the `delta <
    // 1e-4` guard terminated every streamline after a single step. Overlay
    // then only held single-splat clusters.
    // After the fix: streamlines march for many steps and the overlay
    // touches an order of magnitude more voxels.
    const out = solveWheelerDeWitt({
      boundaryCondition: 'tunneling',
      inflatonMass: 0.3,
      cosmologicalConstant: 0.2,
      aMin: 0.5,
      aMax: 2.0,
      gridNa: 32,
      gridNphi: 16,
      phiExtent: 2.0,
    })
    const overlay = integrateWkbStreamlines(out, {
      density: 4,
      maxSteps: 40,
      splatRadius: 0.9,
    })

    let touched = 0
    for (let i = 0; i < overlay.intensity.length; i++) {
      if ((overlay.intensity[i] ?? 0) > 1e-6) touched++
    }

    // Broken: ~seedCount × splatFootprint ≈ O(100) voxels.
    // Fixed: seedCount × steps × splatFootprint ≈ O(10000). 1000 gives
    // comfortable margin and is insensitive to small physics tuning.
    expect(touched).toBeGreaterThan(1000)
  })
})
