/**
 * Tests for the TDSE 1D potential profile evaluation.
 *
 * Verifies V(x) computation for each potential type and the
 * profile sampling/plotting utilities.
 */

import { describe, expect, it } from 'vitest'

import type { TdseConfig } from '@/lib/geometry/extended/tdse'
import {
  computePacketKineticEnergy,
  evaluatePotential1D,
  getPotentialPlotScale,
  samplePotentialProfile,
} from '@/lib/physics/tdse/potentialProfile'

/** Minimal config factory for testing. Override only what each test needs. */
function createConfig(overrides: Partial<TdseConfig> = {}): TdseConfig {
  return {
    latticeDim: 1,
    gridSize: [64],
    spacing: [0.1],
    mass: 1.0,
    hbar: 1.0,
    dt: 0.01,
    stepsPerFrame: 1,
    initialCondition: 'gaussian',
    packetCenter: [0],
    packetWidth: 1.0,
    packetAmplitude: 1.0,
    packetMomentum: [5.0],
    potentialType: 'free',
    barrierHeight: 10,
    barrierWidth: 1.0,
    barrierCenter: 0,
    wellDepth: 5,
    wellWidth: 2.0,
    harmonicOmega: 1.0,
    stepHeight: 8,
    slitSeparation: 2,
    slitWidth: 0.5,
    wallThickness: 0.2,
    wallHeight: 20,
    latticePeriod: 1.0,
    latticeDepth: 5.0,
    doubleWellSeparation: 1.0,
    doubleWellLambda: 1.0,
    doubleWellAsymmetry: 0,
    driveAmplitude: 1,
    driveFrequency: 1,
    driveWaveform: 'sine',
    pmlEnabled: false,
    pmlWidth: 8,
    pmlSigmaMax: 1,
    // BEC fields
    becInteractionStrength: 0,
    becEnabled: false,
    trapAnisotropy: [1, 1, 1],
    ...overrides,
  } as TdseConfig
}

describe('evaluatePotential1D', () => {
  it('free potential returns 0 everywhere', () => {
    const cfg = createConfig({ potentialType: 'free' })
    expect(evaluatePotential1D(-10, cfg)).toBe(0)
    expect(evaluatePotential1D(0, cfg)).toBe(0)
    expect(evaluatePotential1D(10, cfg)).toBe(0)
  })

  it('barrier returns height inside and 0 outside', () => {
    const cfg = createConfig({
      potentialType: 'barrier',
      barrierCenter: 0,
      barrierWidth: 2.0,
      barrierHeight: 10,
    })
    expect(evaluatePotential1D(0, cfg)).toBe(10) // center
    expect(evaluatePotential1D(0.5, cfg)).toBe(10) // inside
    expect(evaluatePotential1D(-0.5, cfg)).toBe(10) // inside
    expect(evaluatePotential1D(2.0, cfg)).toBe(0) // outside
    expect(evaluatePotential1D(-2.0, cfg)).toBe(0) // outside
  })

  it('step returns height after center, 0 before', () => {
    const cfg = createConfig({
      potentialType: 'step',
      barrierCenter: 1.0,
      stepHeight: 8,
    })
    expect(evaluatePotential1D(0, cfg)).toBe(0) // before step
    expect(evaluatePotential1D(2, cfg)).toBe(8) // after step
  })

  it('finiteWell returns -depth inside, 0 outside, centered at origin', () => {
    const cfg = createConfig({
      potentialType: 'finiteWell',
      wellWidth: 4.0,
      wellDepth: 5,
    })
    expect(evaluatePotential1D(0, cfg)).toBe(-5) // center
    expect(evaluatePotential1D(1, cfg)).toBe(-5) // inside
    expect(evaluatePotential1D(3, cfg)).toBe(0) // outside
  })

  it('harmonicTrap returns V = ½mω²x²', () => {
    const cfg = createConfig({
      potentialType: 'harmonicTrap',
      mass: 1.0,
      harmonicOmega: 2.0,
    })
    // V(3) = 0.5 * 1 * 4 * 9 = 18
    expect(evaluatePotential1D(3, cfg)).toBeCloseTo(18, 10)
    expect(evaluatePotential1D(0, cfg)).toBe(0) // minimum at origin
    // Symmetric
    expect(evaluatePotential1D(2, cfg)).toBeCloseTo(evaluatePotential1D(-2, cfg), 10)
  })

  it('periodicLattice returns V₀cos²(πx/a)', () => {
    const cfg = createConfig({
      potentialType: 'periodicLattice',
      latticePeriod: 2.0,
      latticeDepth: 5.0,
    })
    // At x=0: cos(0)=1, V=5
    expect(evaluatePotential1D(0, cfg)).toBeCloseTo(5, 10)
    // At x=1 (half period): cos(π/2)=0, V=0
    expect(evaluatePotential1D(1, cfg)).toBeCloseTo(0, 10)
  })

  it('doubleWell returns λ(x²-a²)² - εx', () => {
    const cfg = createConfig({
      potentialType: 'doubleWell',
      doubleWellSeparation: 1.0,
      doubleWellLambda: 1.0,
      doubleWellAsymmetry: 0,
    })
    // At x=±1 (minima): (1-1)²*λ = 0
    expect(evaluatePotential1D(1, cfg)).toBeCloseTo(0, 10)
    expect(evaluatePotential1D(-1, cfg)).toBeCloseTo(0, 10)
    // At x=0 (local max): (0-1)²*λ = 1
    expect(evaluatePotential1D(0, cfg)).toBeCloseTo(1, 10)
  })

  it('doubleWell with asymmetry breaks symmetry', () => {
    const cfg = createConfig({
      potentialType: 'doubleWell',
      doubleWellSeparation: 1.0,
      doubleWellLambda: 1.0,
      doubleWellAsymmetry: 0.5,
    })
    const vLeft = evaluatePotential1D(-1, cfg)
    const vRight = evaluatePotential1D(1, cfg)
    expect(vLeft).not.toBeCloseTo(vRight, 4)
    // Asymmetry tilts: V(−1) > V(+1) for positive ε
    expect(vLeft).toBeGreaterThan(vRight)
  })

  it('driven potential matches static barrier shape', () => {
    const cfg = createConfig({
      potentialType: 'driven',
      barrierCenter: 0,
      barrierWidth: 2.0,
      barrierHeight: 10,
    })
    expect(evaluatePotential1D(0, cfg)).toBe(10) // inside
    expect(evaluatePotential1D(0.5, cfg)).toBe(10) // inside
    expect(evaluatePotential1D(2.0, cfg)).toBe(0) // outside
  })

  it('doubleSlit returns wallHeight inside wall region', () => {
    const cfg = createConfig({
      potentialType: 'doubleSlit',
      barrierCenter: 0,
      wallThickness: 1.0,
      wallHeight: 20,
    })
    // Inside wall (|x - center| < halfThickness)
    expect(evaluatePotential1D(0, cfg)).toBe(20)
    expect(evaluatePotential1D(0.3, cfg)).toBe(20)
    // Outside wall
    expect(evaluatePotential1D(2.0, cfg)).toBe(0)
  })

  it('unknown potential type returns 0', () => {
    const cfg = createConfig({ potentialType: 'unknown' as never })
    expect(evaluatePotential1D(5, cfg)).toBe(0)
  })
})

describe('samplePotentialProfile', () => {
  it('returns arrays of matching length', () => {
    const cfg = createConfig({ potentialType: 'barrier' })
    const profile = samplePotentialProfile(cfg, 100)
    expect(profile.xs.length).toBe(profile.vs.length)
    expect(profile.xs.length).toBeGreaterThanOrEqual(100)
  })

  it('xs are sorted in ascending order', () => {
    const cfg = createConfig({ potentialType: 'barrier' })
    const { xs } = samplePotentialProfile(cfg, 50)
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]!).toBeGreaterThanOrEqual(xs[i - 1]!)
    }
  })

  it('vMin ≤ vMax', () => {
    const cfg = createConfig({ potentialType: 'finiteWell' })
    const { vMin, vMax } = samplePotentialProfile(cfg)
    expect(vMin).toBeLessThanOrEqual(vMax)
  })

  it('free potential has vMin = vMax = 0', () => {
    const cfg = createConfig({ potentialType: 'free' })
    const { vMin, vMax } = samplePotentialProfile(cfg)
    expect(vMin).toBe(0)
    expect(vMax).toBe(0)
  })

  it('step potential inserts discontinuity edge points', () => {
    const cfg = createConfig({ potentialType: 'step', barrierCenter: 0, stepHeight: 8 })
    const { xs, vs } = samplePotentialProfile(cfg, 50)
    // Should have more points than the uniform 50 due to edge insertion
    expect(xs.length).toBeGreaterThan(50)
    // Should contain the step value
    expect(vs.some((v) => v === 8)).toBe(true)
  })

  it('doubleSlit potential inserts wall edge points', () => {
    const cfg = createConfig({
      potentialType: 'doubleSlit',
      barrierCenter: 0,
      wallThickness: 0.2,
      wallHeight: 20,
    })
    const { xs, vs } = samplePotentialProfile(cfg, 50)
    expect(xs.length).toBeGreaterThan(50)
    expect(vs.some((v) => v === 20)).toBe(true)
  })

  it('finiteWell inserts well edge points', () => {
    const cfg = createConfig({
      potentialType: 'finiteWell',
      wellWidth: 2.0,
      wellDepth: 5,
    })
    const { vs, vMin } = samplePotentialProfile(cfg, 50)
    expect(vs.some((v) => v === -5)).toBe(true)
    expect(vMin).toBe(-5)
  })

  it('driven potential inserts barrier edge points', () => {
    const cfg = createConfig({
      potentialType: 'driven',
      barrierCenter: 0,
      barrierWidth: 1.0,
      barrierHeight: 10,
    })
    const { xs } = samplePotentialProfile(cfg, 50)
    expect(xs.length).toBeGreaterThan(50)
  })
})

describe('getPotentialPlotScale', () => {
  it('returns at least 1 for all potential types', () => {
    const types = [
      'free',
      'barrier',
      'step',
      'finiteWell',
      'harmonicTrap',
      'doubleSlit',
      'periodicLattice',
      'doubleWell',
    ] as const
    for (const pt of types) {
      const cfg = createConfig({ potentialType: pt })
      expect(getPotentialPlotScale(cfg)).toBeGreaterThanOrEqual(1)
    }
  })

  it('returns barrierHeight for barrier type', () => {
    const cfg = createConfig({ potentialType: 'barrier', barrierHeight: 15 })
    expect(getPotentialPlotScale(cfg)).toBe(15)
  })
})

describe('computePacketKineticEnergy', () => {
  it('computes E_k = ℏ²|k₀|²/(2m) for 1D', () => {
    const cfg = createConfig({ hbar: 1, mass: 1, packetMomentum: [5] })
    // E = 1*25 / 2 = 12.5
    expect(computePacketKineticEnergy(cfg)).toBeCloseTo(12.5, 10)
  })

  it('computes correctly for multi-dimensional momentum', () => {
    const cfg = createConfig({ hbar: 1, mass: 2, packetMomentum: [3, 4] })
    // |k|² = 9 + 16 = 25, E = 1*25 / 4 = 6.25
    expect(computePacketKineticEnergy(cfg)).toBeCloseTo(6.25, 10)
  })

  it('returns 0 for zero momentum', () => {
    const cfg = createConfig({ packetMomentum: [0, 0, 0] })
    expect(computePacketKineticEnergy(cfg)).toBe(0)
  })
})
