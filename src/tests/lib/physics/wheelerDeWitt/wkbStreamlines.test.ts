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
    // near the horizon; require < 25% leakage (splat radius 0.35 cells).
    expect(leakage.fraction).toBeLessThan(0.25)
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
})
