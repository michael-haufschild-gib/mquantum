import { describe, expect, it } from 'vitest'

import {
  computePMLSigmaMax,
  computePMLSigmaMaxND,
  PML_GRADING_EXPONENT,
  sigmaMaxFromPmlConfig,
} from '@/lib/physics/pml/profile'

describe('computePMLSigmaMax (legacy per-step formula)', () => {
  it('outer-edge damping per full step equals R_target', () => {
    const dt = 0.005
    for (const R of [1e-3, 1e-6, 1e-10]) {
      const sigmaMax = computePMLSigmaMax(R, dt)
      const edgeDamp = Math.exp(-sigmaMax * dt)
      expect(edgeDamp).toBeCloseTo(R, 10)
    }
  })

  it('returns 0 for invalid inputs', () => {
    expect(computePMLSigmaMax(0, 0.005)).toBe(0)
    expect(computePMLSigmaMax(-1, 0.005)).toBe(0)
    expect(computePMLSigmaMax(1, 0.005)).toBe(0)
    expect(computePMLSigmaMax(NaN, 0.005)).toBe(0)
    expect(computePMLSigmaMax(1e-6, 0)).toBe(0)
    expect(computePMLSigmaMax(1e-6, -1)).toBe(0)
  })
})

describe('computePMLSigmaMaxND (traversal formula)', () => {
  it('round-trip attenuation matches R_target', () => {
    const dt = 0.003
    const pmlWidth = 0.2
    const gridSizes = [64, 64, 64]
    const order = 3
    const nPML = pmlWidth * 64

    for (const R of [1e-3, 1e-6, 1e-10]) {
      const sigmaMax = computePMLSigmaMaxND(R, pmlWidth, gridSizes, dt, order, 3)
      const roundTrip = Math.exp((-2 * sigmaMax * dt * nPML) / (order + 1))
      expect(roundTrip).toBeCloseTo(R, 8)
    }
  })

  it('σ_max depends on PML width (wider → smaller σ_max)', () => {
    const dt = 0.005
    const gridSizes = [64, 64, 64]
    const sigmaNarrow = computePMLSigmaMaxND(1e-6, 0.1, gridSizes, dt, 3, 3)
    const sigmaWide = computePMLSigmaMaxND(1e-6, 0.4, gridSizes, dt, 3, 3)
    expect(sigmaWide).toBeLessThan(sigmaNarrow)
  })

  it('uses minimum PML width across dimensions', () => {
    const dt = 0.005
    const sigma = computePMLSigmaMaxND(1e-6, 0.2, [64, 32], dt, 3, 2)
    const sigmaRef = computePMLSigmaMaxND(1e-6, 0.2, [32, 32], dt, 3, 2)
    expect(sigma).toBe(sigmaRef)
  })

  it('returns 0 for invalid inputs', () => {
    expect(computePMLSigmaMaxND(0, 0.2, [64], 0.005)).toBe(0)
    expect(computePMLSigmaMaxND(NaN, 0.2, [64], 0.005)).toBe(0)
    expect(computePMLSigmaMaxND(1e-6, 0.2, [64], 0)).toBe(0)
    expect(computePMLSigmaMaxND(1e-6, 0, [64], 0.005)).toBe(0)
    expect(computePMLSigmaMaxND(1e-6, 0.5001, [64], 0.005)).toBe(0)
    expect(computePMLSigmaMaxND(1e-6, 0.2, [], 0.005)).toBe(0)
  })

  it('treats the UI maximum pmlWidth=0.5 as enabled', () => {
    const sigma = computePMLSigmaMaxND(1e-6, 0.5, [64], 0.005, 3, 1)
    expect(sigma).toBeGreaterThan(0)
    const roundTrip = Math.exp((-2 * sigma * 0.005 * 32) / 4)
    expect(roundTrip).toBeCloseTo(1e-6, 8)
  })
})

describe('computePMLSigmaMax — edge cases', () => {
  it('returns 0 for Infinity dt', () => {
    expect(computePMLSigmaMax(1e-6, Infinity)).toBe(0)
  })

  it('returns 0 for Infinity targetReflection', () => {
    expect(computePMLSigmaMax(Infinity, 0.005)).toBe(0)
  })

  it('σ_max increases with smaller R_target (stronger damping)', () => {
    const s1 = computePMLSigmaMax(1e-3, 0.005)
    const s2 = computePMLSigmaMax(1e-6, 0.005)
    const s3 = computePMLSigmaMax(1e-10, 0.005)
    expect(s2).toBeGreaterThan(s1)
    expect(s3).toBeGreaterThan(s2)
  })

  it('σ_max is inversely proportional to dt', () => {
    const s1 = computePMLSigmaMax(1e-6, 0.01)
    const s2 = computePMLSigmaMax(1e-6, 0.005)
    // s2 should be ~2x s1
    expect(s2 / s1).toBeCloseTo(2.0, 5)
  })

  it('specific value: R=1e-6, dt=0.005 gives σ_max = -ln(1e-6)/0.005', () => {
    const expected = -Math.log(1e-6) / 0.005
    expect(computePMLSigmaMax(1e-6, 0.005)).toBeCloseTo(expected, 5)
  })
})

describe('computePMLSigmaMaxND — edge cases', () => {
  it('defaults latticeDim to gridSizes.length when omitted', () => {
    const dt = 0.005
    const gridSizes = [64, 64]
    const withDim = computePMLSigmaMaxND(1e-6, 0.2, gridSizes, dt, 3, 2)
    const withoutDim = computePMLSigmaMaxND(1e-6, 0.2, gridSizes, dt, 3)
    expect(withoutDim).toBe(withDim)
  })

  it('returns 0 for zero-size grid dimension', () => {
    expect(computePMLSigmaMaxND(1e-6, 0.2, [64, 0], 0.005, 3, 2)).toBe(0)
  })

  it('returns 0 for dims=0', () => {
    expect(computePMLSigmaMaxND(1e-6, 0.2, [64], 0.005, 3, 0)).toBe(0)
  })

  it('returns 0 for R_target >= 1', () => {
    expect(computePMLSigmaMaxND(1.0, 0.2, [64], 0.005, 3, 1)).toBe(0)
    expect(computePMLSigmaMaxND(1.5, 0.2, [64], 0.005, 3, 1)).toBe(0)
  })

  it('order is clamped to minimum 1', () => {
    const s = computePMLSigmaMaxND(1e-6, 0.2, [64], 0.005, 0, 1)
    const sOrder1 = computePMLSigmaMaxND(1e-6, 0.2, [64], 0.005, 1, 1)
    expect(s).toBe(sOrder1)
  })

  it('higher order → larger σ_max (steeper grading concentrates absorption)', () => {
    const dt = 0.005
    const gs = [64, 64, 64]
    const s1 = computePMLSigmaMaxND(1e-6, 0.2, gs, dt, 1, 3)
    const s3 = computePMLSigmaMaxND(1e-6, 0.2, gs, dt, 3, 3)
    const s5 = computePMLSigmaMaxND(1e-6, 0.2, gs, dt, 5, 3)
    expect(s3).toBeGreaterThan(s1)
    expect(s5).toBeGreaterThan(s3)
  })
})

describe('PML_GRADING_EXPONENT', () => {
  it('is 3 (cubic polynomial)', () => {
    expect(PML_GRADING_EXPONENT).toBe(3)
  })
})

describe('CAP physics properties', () => {
  it('damping near PML interface is negligible (cubic grading)', () => {
    const dt = 0.003
    const sigmaMax = computePMLSigmaMaxND(1e-6, 0.2, [64, 64, 64], dt, 3, 3)
    const nPML = 0.2 * 64
    const innerRatio = 1.0 / nPML
    const sigmaAtInterface = sigmaMax * innerRatio * innerRatio * innerRatio
    const dampPerHalfStep = Math.exp(-sigmaAtInterface * dt * 0.5)
    expect(dampPerHalfStep).toBeGreaterThan(0.999)
  })

  it('real damping preserves phase (no impedance rotation)', () => {
    const re = 0.7
    const im = 0.3
    const halfSigmaDt = 2.5
    const dampFactor = Math.exp(-halfSigmaDt)
    const newRe = re * dampFactor
    const newIm = im * dampFactor
    expect(Math.atan2(newIm, newRe)).toBeCloseTo(Math.atan2(im, re), 10)
    const origNorm = re * re + im * im
    const newNorm = newRe * newRe + newIm * newIm
    expect(newNorm).toBeCloseTo(origNorm * Math.exp(-2 * halfSigmaDt), 10)
  })
})

describe('sigmaMaxFromPmlConfig (compute-pass wrapper)', () => {
  const baseCfg = {
    absorberEnabled: true,
    pmlTargetReflection: 1e-6,
    absorberWidth: 0.2,
    gridSize: [64, 64, 64],
    dt: 0.005,
    latticeDim: 3,
  }

  it('returns 0 when absorberEnabled is false (short-circuits before compute)', () => {
    expect(sigmaMaxFromPmlConfig({ ...baseCfg, absorberEnabled: false })).toBe(0)
  })

  it('matches computePMLSigmaMaxND with PML_GRADING_EXPONENT when enabled', () => {
    const expected = computePMLSigmaMaxND(
      baseCfg.pmlTargetReflection,
      baseCfg.absorberWidth,
      baseCfg.gridSize,
      baseCfg.dt,
      PML_GRADING_EXPONENT,
      baseCfg.latticeDim
    )
    expect(sigmaMaxFromPmlConfig(baseCfg)).toBe(expected)
  })

  it('defaults undefined pmlTargetReflection to 1e-6', () => {
    const withDefault = sigmaMaxFromPmlConfig({ ...baseCfg, pmlTargetReflection: undefined })
    const explicit = sigmaMaxFromPmlConfig({ ...baseCfg, pmlTargetReflection: 1e-6 })
    expect(withDefault).toBe(explicit)
  })
})
