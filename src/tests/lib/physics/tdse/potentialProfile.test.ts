/**
 * Tests for the TDSE 1D potential profile evaluation.
 *
 * Verifies V(x) computation for each potential type and the
 * profile sampling/plotting utilities.
 */

import { beforeAll, describe, expect, it } from 'vitest'

import { DEFAULT_TDSE_CONFIG, type TdseConfig } from '@/lib/geometry/extended/tdse'
import {
  computePacketKineticEnergy,
  evaluatePotential1D,
  getPotentialPlotScale,
  samplePotentialProfile,
} from '@/lib/physics/tdse/potentialProfile'

/** Minimal config factory for testing. Override only what each test needs. */
function createConfig(overrides: Partial<TdseConfig> = {}): TdseConfig {
  return { ...DEFAULT_TDSE_CONFIG, ...overrides }
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

  it('radialDoubleWell V = D*(|x|-r1)²*(|x|-r2)² - tilt*|x|', () => {
    const cfg = createConfig({
      potentialType: 'radialDoubleWell',
      radialWellInner: 1.0,
      radialWellOuter: 3.0,
      radialWellDepth: 1.0,
      radialWellTilt: 0,
    } as Partial<TdseConfig>)
    // At x=1 (inner well): dr1=0, V=0
    expect(evaluatePotential1D(1, cfg)).toBeCloseTo(0, 10)
    // At x=-1: r=|x|=1, same result
    expect(evaluatePotential1D(-1, cfg)).toBeCloseTo(0, 10)
    // At x=3 (outer well): dr2=0, V=0
    expect(evaluatePotential1D(3, cfg)).toBeCloseTo(0, 10)
    // At x=2 (midpoint): dr1=1, dr2=-1, V=1*1*1=1
    expect(evaluatePotential1D(2, cfg)).toBeCloseTo(1.0, 10)
  })

  it('radialDoubleWell tilt breaks symmetry between inner and outer wells', () => {
    const cfg = createConfig({
      potentialType: 'radialDoubleWell',
      radialWellInner: 1.0,
      radialWellOuter: 3.0,
      radialWellDepth: 1.0,
      radialWellTilt: 0.5,
    } as Partial<TdseConfig>)
    // At r=1: V = 0 - 0.5*1 = -0.5
    expect(evaluatePotential1D(1, cfg)).toBeCloseTo(-0.5, 10)
    // At r=3: V = 0 - 0.5*3 = -1.5
    expect(evaluatePotential1D(3, cfg)).toBeCloseTo(-1.5, 10)
  })

  it('coupledAnharmonic 1D slice equals pure harmonic (cross terms vanish)', () => {
    const cfg = createConfig({
      potentialType: 'coupledAnharmonic',
      mass: 1.0,
      harmonicOmega: 2.0,
    } as Partial<TdseConfig>)
    // On the 1D axis, coupling vanishes → V = 0.5*m*ω²*x²
    // V(3) = 0.5 * 1 * 4 * 9 = 18
    expect(evaluatePotential1D(3, cfg)).toBeCloseTo(18, 10)
    expect(evaluatePotential1D(0, cfg)).toBeCloseTo(0, 10)
  })

  it('unknown potential type returns 0', () => {
    const cfg = createConfig({ potentialType: 'unknown' as never })
    expect(evaluatePotential1D(5, cfg)).toBe(0)
  })

  it('custom expression evaluates V(x) along axis 0', () => {
    const cfg = createConfig({
      potentialType: 'custom',
      customPotentialExpression: '0.5 * x^2',
      latticeDim: 1,
    } as Partial<TdseConfig>)
    // V(2) = 0.5 * 4 = 2
    expect(evaluatePotential1D(2, cfg)).toBeCloseTo(2, 10)
    expect(evaluatePotential1D(0, cfg)).toBeCloseTo(0, 10)
    expect(evaluatePotential1D(-3, cfg)).toBeCloseTo(4.5, 10)
  })

  it('custom expression with multiple variables evaluates along axis 0 (others = 0)', () => {
    const cfg = createConfig({
      potentialType: 'custom',
      customPotentialExpression: 'x^2 + y^2',
      latticeDim: 2,
    } as Partial<TdseConfig>)
    // y=0 in 1D profile, so V(x) = x^2
    expect(evaluatePotential1D(3, cfg)).toBeCloseTo(9, 10)
  })

  it('custom expression returns 0 for invalid expression', () => {
    const cfg = createConfig({
      potentialType: 'custom',
      customPotentialExpression: 'invalid!!!',
    } as Partial<TdseConfig>)
    expect(evaluatePotential1D(1, cfg)).toBe(0)
  })

  it('custom expression returns 0 for missing expression', () => {
    const cfg = createConfig({
      potentialType: 'custom',
      customPotentialExpression: undefined,
    } as Partial<TdseConfig>)
    // customPotentialExpression is undefined → fallback to '0'
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

  it('custom expression profiles contain the evaluated V(x)', () => {
    const cfg = createConfig({
      potentialType: 'custom',
      customPotentialExpression: '5 * x^2',
      latticeDim: 1,
      gridSize: [64],
      spacing: [0.1],
    } as Partial<TdseConfig>)
    const profile = samplePotentialProfile(cfg, 100)
    expect(profile.xs.length).toBe(profile.vs.length)
    // At x=0 the value should be near 0
    const centerIdx = profile.xs.findIndex((x) => Math.abs(x) < 0.05)
    if (centerIdx >= 0) {
      expect(profile.vs[centerIdx]).toBeCloseTo(0, 0)
    }
    // Profile should have non-zero max for a quadratic
    expect(profile.vMax).toBeGreaterThan(0)
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
      'radialDoubleWell',
      'coupledAnharmonic',
    ] as const
    for (const pt of types) {
      const cfg = createConfig({ potentialType: pt } as Partial<TdseConfig>)
      expect(getPotentialPlotScale(cfg), `${pt}`).toBeGreaterThanOrEqual(1)
    }
  })

  it('returns barrierHeight for barrier type', () => {
    const cfg = createConfig({ potentialType: 'barrier', barrierHeight: 15 })
    expect(getPotentialPlotScale(cfg)).toBe(15)
  })

  it('returns stepHeight for step type', () => {
    const cfg = createConfig({ potentialType: 'step', stepHeight: 12 })
    expect(getPotentialPlotScale(cfg)).toBe(12)
  })

  it('returns wellDepth for finiteWell type', () => {
    const cfg = createConfig({ potentialType: 'finiteWell', wellDepth: 7 })
    expect(getPotentialPlotScale(cfg)).toBe(7)
  })

  it('returns wallHeight for doubleSlit type', () => {
    const cfg = createConfig({ potentialType: 'doubleSlit', wallHeight: 25 })
    expect(getPotentialPlotScale(cfg)).toBe(25)
  })

  it('returns latticeDepth for periodicLattice type', () => {
    const cfg = createConfig({ potentialType: 'periodicLattice', latticeDepth: 9 })
    expect(getPotentialPlotScale(cfg)).toBe(9)
  })

  it('returns barrierHeight for driven type', () => {
    const cfg = createConfig({ potentialType: 'driven', barrierHeight: 11 } as Partial<TdseConfig>)
    expect(getPotentialPlotScale(cfg)).toBe(11)
  })

  it('returns λ*a⁴ for doubleWell type', () => {
    const cfg = createConfig({
      potentialType: 'doubleWell',
      doubleWellLambda: 2,
      doubleWellSeparation: 3,
    })
    // scale = λ * a⁴ = 2 * 81 = 162
    expect(getPotentialPlotScale(cfg)).toBe(162)
  })

  it('returns barrier height between wells for radialDoubleWell', () => {
    const cfg = createConfig({
      potentialType: 'radialDoubleWell',
      radialWellInner: 1.0,
      radialWellOuter: 3.0,
      radialWellDepth: 1.0,
    } as Partial<TdseConfig>)
    // rMid = 2, dr1 = 1, dr2 = -1, scale = 1 * 1 * 1 = 1
    expect(getPotentialPlotScale(cfg)).toBe(1)
  })

  it('returns harmonic scale at quarter-domain for coupledAnharmonic', () => {
    const cfg = createConfig({
      potentialType: 'coupledAnharmonic',
      mass: 1.0,
      harmonicOmega: 2.0,
      gridSize: [64],
      spacing: [0.1],
    } as Partial<TdseConfig>)
    // r = 64*0.1*0.25 = 1.6, scale = 0.5*1*4*2.56 = 5.12
    expect(getPotentialPlotScale(cfg)).toBeCloseTo(5.12, 10)
  })

  it('returns harmonicTrap scale based on quarter-domain', () => {
    const cfg = createConfig({
      potentialType: 'harmonicTrap',
      mass: 1.0,
      harmonicOmega: 2.0,
      gridSize: [64],
      spacing: [0.1],
    })
    // r = 64*0.1*0.25 = 1.6, scale = 0.5*1*4*2.56 = 5.12
    expect(getPotentialPlotScale(cfg)).toBeCloseTo(5.12, 10)
  })

  it('returns max|V| for custom expression', () => {
    const cfg = createConfig({
      potentialType: 'custom',
      customPotentialExpression: '10 * x^2',
      latticeDim: 1,
      gridSize: [64],
      spacing: [0.1],
    } as Partial<TdseConfig>)
    const scale = getPotentialPlotScale(cfg)
    // At grid edge: x = 64 * 0.1 * 0.5 = 3.2, V = 10 * 10.24 = 102.4
    // Scale should be at least the max value at the edge
    expect(scale).toBeGreaterThan(1)
    expect(scale).toBeGreaterThan(50) // conservative lower bound
  })

  it('returns 1 for custom expression that fails to parse', () => {
    const cfg = createConfig({
      potentialType: 'custom',
      customPotentialExpression: '!!!invalid',
    } as Partial<TdseConfig>)
    expect(getPotentialPlotScale(cfg)).toBe(1)
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

  it('scales with hbar²', () => {
    const cfg1 = createConfig({ hbar: 1, mass: 1, packetMomentum: [2] })
    const cfg2 = createConfig({ hbar: 2, mass: 1, packetMomentum: [2] })
    // E1 = 1*4/2 = 2, E2 = 4*4/2 = 8
    expect(computePacketKineticEnergy(cfg1)).toBeCloseTo(2, 10)
    expect(computePacketKineticEnergy(cfg2)).toBeCloseTo(8, 10)
    expect(computePacketKineticEnergy(cfg2) / computePacketKineticEnergy(cfg1)).toBeCloseTo(4, 10)
  })
})

// ---------------------------------------------------------------------------
// CPU potential consistency: evaluatePotential1D vs classicalOrbit.evaluatePotential
// ---------------------------------------------------------------------------

describe('evaluatePotential1D ↔ classicalOrbit.evaluatePotential consistency', () => {
  // The 1D HUD profile (potentialProfile.ts) and the N-D orbit integrator
  // (classicalOrbit.ts) both implement the same potentials. If they diverge,
  // the energy diagram would show the wrong potential shape.

  let evaluatePotentialND: typeof import('@/lib/physics/tdse/classicalOrbit').evaluatePotential

  // Dynamic import to avoid circular dependency issues in test setup

  beforeAll(async () => {
    const mod = await import('@/lib/physics/tdse/classicalOrbit')
    evaluatePotentialND = mod.evaluatePotential
  })

  const testPoints = [-2.5, -1.0, -0.3, 0, 0.3, 1.0, 2.5]

  function check(potentialType: TdseConfig['potentialType'], overrides: Partial<TdseConfig> = {}) {
    const cfg = createConfig({ potentialType, latticeDim: 3, ...overrides })
    for (const x of testPoints) {
      const v1D = evaluatePotential1D(x, cfg)
      const vND = evaluatePotentialND(new Float64Array([x, 0, 0]), cfg)
      expect(v1D).toBeCloseTo(vND, 8)
    }
  }

  it('harmonicTrap: 1D matches N-D at y=z=0', () => {
    check('harmonicTrap', { mass: 1.5, harmonicOmega: 2.0 })
  })

  it('barrier: 1D matches N-D at y=z=0', () => {
    check('barrier', { barrierCenter: 0.5, barrierWidth: 1.5, barrierHeight: 8 })
  })

  it('finiteWell: 1D matches N-D at y=z=0', () => {
    check('finiteWell', { wellWidth: 3.0, wellDepth: 7 })
  })

  it('periodicLattice: 1D matches N-D at y=z=0', () => {
    check('periodicLattice', { latticePeriod: 1.5, latticeDepth: 4 })
  })

  it('doubleWell: 1D matches N-D at y=z=0', () => {
    check('doubleWell', {
      doubleWellLambda: 2,
      doubleWellSeparation: 1.2,
      doubleWellAsymmetry: 0.3,
    })
  })

  it('radialDoubleWell: 1D matches N-D at y=z=0', () => {
    // radialDoubleWell uses r=|x| in 1D profile and r=sqrt(x²+y²+z²) in N-D.
    // At y=z=0, r=|x| so they should match.
    check('radialDoubleWell', {
      radialWellInner: 0.8,
      radialWellOuter: 2.5,
      radialWellDepth: 10,
      radialWellTilt: 0.3,
    })
  })

  it('coupledAnharmonic: 1D slice matches N-D at y=z=0 (cross-coupling vanishes)', () => {
    // On the 1D axis slice (y=z=0), the coupling term λΣx_i²x_j² vanishes
    // because all other coordinates are zero. Both should give pure harmonic.
    check('coupledAnharmonic', { mass: 1, harmonicOmega: 1.5, anharmonicLambda: 5 })
  })
})
