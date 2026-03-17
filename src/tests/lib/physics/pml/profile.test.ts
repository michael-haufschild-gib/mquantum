import { describe, it, expect } from 'vitest'
import { computePMLSigmaMax, computePMLSigmaMaxND } from '@/lib/physics/pml/profile'

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
    expect(computePMLSigmaMaxND(1e-6, 0.5, [64], 0.005)).toBe(0)
    expect(computePMLSigmaMaxND(1e-6, 0.2, [], 0.005)).toBe(0)
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
