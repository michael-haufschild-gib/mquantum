import { describe, expect, it } from 'vitest'

import { DEFAULT_TDSE_CONFIG, type TdseConfig } from '@/lib/geometry/extended/tdse'
import {
  computeGradient,
  DEFAULT_ORBIT_CONFIG,
  evaluatePotential,
  generateOrbitsAtEnergy,
  integrateOrbit,
} from '@/lib/physics/tdse/classicalOrbit'

function makeConfig(overrides: Partial<TdseConfig> = {}): TdseConfig {
  return { ...DEFAULT_TDSE_CONFIG, ...overrides }
}

describe('evaluatePotential', () => {
  it('returns 0 for free potential', () => {
    const config = makeConfig({ potentialType: 'free' })
    const x = new Float64Array([1, 2, 3])
    expect(evaluatePotential(x, config)).toBe(0)
  })

  it('computes harmonic trap V = 0.5*m*ω²*r²', () => {
    const config = makeConfig({ potentialType: 'harmonicTrap', mass: 1, harmonicOmega: 2 })
    const x = new Float64Array([1, 0, 0])
    // V = 0.5 * 1 * 4 * 1 = 2
    expect(evaluatePotential(x, config)).toBeCloseTo(2.0, 10)
  })

  it('harmonic trap scales with mass and multi-dimensional r²', () => {
    const config = makeConfig({ potentialType: 'harmonicTrap', mass: 2, harmonicOmega: 3 })
    const x = new Float64Array([1, 2, 0])
    // V = 0.5 * 2 * 9 * (1+4) = 45
    expect(evaluatePotential(x, config)).toBeCloseTo(45.0, 10)
  })

  it('computes coupled anharmonic V = harmonic + λΣx_i²x_j²', () => {
    const config = makeConfig({
      potentialType: 'coupledAnharmonic',
      mass: 1,
      harmonicOmega: 1,
      anharmonicLambda: 1,
      latticeDim: 2,
    })
    const x = new Float64Array([1, 1])
    // harmonic = 0.5 * 1 * 1 * (1+1) = 1
    // coupling = 1 * 1 * 1 = 1 (one pair i=0,j=1)
    // total = 2
    expect(evaluatePotential(x, config)).toBeCloseTo(2.0, 10)
  })

  it('coupled anharmonic with λ=0 reduces to harmonic', () => {
    const config = makeConfig({
      potentialType: 'coupledAnharmonic',
      mass: 1,
      harmonicOmega: 1,
      anharmonicLambda: 0,
      latticeDim: 3,
    })
    const configH = makeConfig({
      potentialType: 'harmonicTrap',
      mass: 1,
      harmonicOmega: 1,
      latticeDim: 3,
    })
    const x = new Float64Array([0.5, 0.3, 0.7])
    expect(evaluatePotential(x, config)).toBeCloseTo(evaluatePotential(x, configH), 10)
  })

  it('coupled anharmonic 3D has 3 coupling pairs', () => {
    const config = makeConfig({
      potentialType: 'coupledAnharmonic',
      mass: 1,
      harmonicOmega: 1,
      anharmonicLambda: 2,
      latticeDim: 3,
    })
    const x = new Float64Array([1, 2, 3])
    // harmonic = 0.5 * 1 * 1 * (1+4+9) = 7
    // coupling pairs: (0,1)→1*4=4, (0,2)→1*9=9, (1,2)→4*9=36 → sum=49
    // total = 7 + 2*49 = 105
    expect(evaluatePotential(x, config)).toBeCloseTo(105.0, 10)
  })

  it('double well V(x) = λ(x²-a²)² - εx', () => {
    const config = makeConfig({
      potentialType: 'doubleWell',
      doubleWellLambda: 1,
      doubleWellSeparation: 1,
      doubleWellAsymmetry: 0,
    })
    // At x=1: V = 1*(1-1)² - 0 = 0
    expect(evaluatePotential(new Float64Array([1, 0, 0]), config)).toBeCloseTo(0, 10)
    // At x=0: V = 1*(0-1)² - 0 = 1
    expect(evaluatePotential(new Float64Array([0, 0, 0]), config)).toBeCloseTo(1, 10)
  })

  it('double well with asymmetry: V(-1) ≠ V(+1)', () => {
    const config = makeConfig({
      potentialType: 'doubleWell',
      doubleWellLambda: 1,
      doubleWellSeparation: 1,
      doubleWellAsymmetry: 0.5,
    })
    // At x=+1: V = 0 - 0.5*1 = -0.5
    expect(evaluatePotential(new Float64Array([1, 0, 0]), config)).toBeCloseTo(-0.5, 10)
    // At x=-1: V = 0 - 0.5*(-1) = 0.5
    expect(evaluatePotential(new Float64Array([-1, 0, 0]), config)).toBeCloseTo(0.5, 10)
  })

  it('barrier returns height inside and 0 outside', () => {
    const config = makeConfig({
      potentialType: 'barrier',
      barrierCenter: 0,
      barrierWidth: 2.0,
      barrierHeight: 10,
    })
    // Inside: |x[0] - center| < width*0.5
    expect(evaluatePotential(new Float64Array([0, 0, 0]), config)).toBe(10)
    expect(evaluatePotential(new Float64Array([0.5, 0, 0]), config)).toBe(10)
    // Outside
    expect(evaluatePotential(new Float64Array([2.0, 0, 0]), config)).toBe(0)
  })

  it('finiteWell returns -depth inside, 0 outside', () => {
    const config = makeConfig({
      potentialType: 'finiteWell',
      wellWidth: 4.0,
      wellDepth: 5,
    })
    // Inside: |x[0]| < width*0.5 = 2
    expect(evaluatePotential(new Float64Array([0, 0, 0]), config)).toBe(-5)
    expect(evaluatePotential(new Float64Array([1.5, 0, 0]), config)).toBe(-5)
    // Outside
    expect(evaluatePotential(new Float64Array([3, 0, 0]), config)).toBe(0)
  })

  it('periodicLattice V = V₀·cos²(πx/a)', () => {
    const config = makeConfig({
      potentialType: 'periodicLattice',
      latticePeriod: 2.0,
      latticeDepth: 5.0,
    })
    // At x=0: cos(0)=1, V=5
    expect(evaluatePotential(new Float64Array([0, 0, 0]), config)).toBeCloseTo(5.0, 10)
    // At x=1 (half period): cos(π/2)=0, V=0
    expect(evaluatePotential(new Float64Array([1, 0, 0]), config)).toBeCloseTo(0, 10)
    // At x=2 (full period): cos(π)=-1, V=5
    expect(evaluatePotential(new Float64Array([2, 0, 0]), config)).toBeCloseTo(5.0, 10)
  })

  it('periodicLattice guards against zero period', () => {
    const config = makeConfig({
      potentialType: 'periodicLattice',
      latticePeriod: 0,
      latticeDepth: 5.0,
    })
    const v = evaluatePotential(new Float64Array([1, 0, 0]), config)
    expect(Number.isFinite(v)).toBe(true)
  })

  it('radialDoubleWell V = D*(r-r1)²*(r-r2)² - tilt*r', () => {
    const config = makeConfig({
      potentialType: 'radialDoubleWell',
      radialWellInner: 1.0,
      radialWellOuter: 3.0,
      radialWellDepth: 1.0,
      radialWellTilt: 0,
    })
    // At r=1 (inner well): dr1=0, V=0
    const x1 = new Float64Array([1, 0, 0])
    expect(evaluatePotential(x1, config)).toBeCloseTo(0, 10)
    // At r=3 (outer well): dr2=0, V=0
    const x3 = new Float64Array([3, 0, 0])
    expect(evaluatePotential(x3, config)).toBeCloseTo(0, 10)
    // At r=2 (midpoint): dr1=1, dr2=-1, V=1*1*1=1
    const x2 = new Float64Array([2, 0, 0])
    expect(evaluatePotential(x2, config)).toBeCloseTo(1.0, 10)
  })

  it('radialDoubleWell tilt breaks symmetry', () => {
    const config = makeConfig({
      potentialType: 'radialDoubleWell',
      radialWellInner: 1.0,
      radialWellOuter: 3.0,
      radialWellDepth: 1.0,
      radialWellTilt: 0.5,
    })
    // At r=1: V = 0 - 0.5*1 = -0.5
    expect(evaluatePotential(new Float64Array([1, 0, 0]), config)).toBeCloseTo(-0.5, 10)
    // At r=3: V = 0 - 0.5*3 = -1.5
    expect(evaluatePotential(new Float64Array([3, 0, 0]), config)).toBeCloseTo(-1.5, 10)
  })

  it('radialDoubleWell uses Euclidean norm in multiple dimensions', () => {
    const config = makeConfig({
      potentialType: 'radialDoubleWell',
      radialWellInner: 1.0,
      radialWellOuter: 3.0,
      radialWellDepth: 1.0,
      radialWellTilt: 0,
    })
    // r = sqrt(0.6² + 0.8²) = 1.0 → at inner well
    expect(evaluatePotential(new Float64Array([0.6, 0.8, 0]), config)).toBeCloseTo(0, 10)
  })

  it('becTrap V = 0.5*m*Σ(ω_d² * x_d²) with anisotropy', () => {
    const config = makeConfig({
      potentialType: 'becTrap',
      mass: 1.0,
      harmonicOmega: 2.0,
      trapAnisotropy: [1, 2, 3],
    })
    const x = new Float64Array([1, 1, 1])
    // ω_0 = 2*1=2, ω_1 = 2*2=4, ω_2 = 2*3=6
    // V = 0.5 * 1 * (4*1 + 16*1 + 36*1) = 0.5 * 56 = 28
    expect(evaluatePotential(x, config)).toBeCloseTo(28.0, 10)
  })

  it('becTrap defaults missing anisotropy to 1.0', () => {
    const config = makeConfig({
      potentialType: 'becTrap',
      mass: 1.0,
      harmonicOmega: 1.0,
      trapAnisotropy: [],
    })
    const x = new Float64Array([1, 0, 0])
    // Missing anisotropy defaults to 1.0 → ω_0 = 1*1=1
    // V = 0.5 * 1 * (1*1) = 0.5
    expect(evaluatePotential(x, config)).toBeCloseTo(0.5, 10)
  })

  it('fallback potential uses harmonic for unrecognized type', () => {
    const config = makeConfig({
      potentialType: 'driven' as TdseConfig['potentialType'],
      mass: 1,
      harmonicOmega: 2,
    })
    const x = new Float64Array([1, 0, 0])
    // Fallback harmonic: 0.5 * 1 * 4 * 1 = 2
    expect(evaluatePotential(x, config)).toBeCloseTo(2.0, 10)
  })
})

describe('computeGradient', () => {
  it('computes ∇V for harmonic trap analytically: ∇V = m*ω²*x', () => {
    const config = makeConfig({ potentialType: 'harmonicTrap', mass: 1, harmonicOmega: 2 })
    const x = new Float64Array([1, 2, 3])
    const grad = new Float64Array(3)
    computeGradient(x, config, grad)
    // ∂V/∂x_d = m*ω²*x_d = 1*4*x_d
    expect(grad[0]).toBeCloseTo(4.0, 4)
    expect(grad[1]).toBeCloseTo(8.0, 4)
    expect(grad[2]).toBeCloseTo(12.0, 4)
  })

  it('gradient of free potential is zero', () => {
    const config = makeConfig({ potentialType: 'free' })
    const x = new Float64Array([1, 2, 3])
    const grad = new Float64Array(3)
    computeGradient(x, config, grad)
    expect(grad[0]).toBeCloseTo(0, 10)
    expect(grad[1]).toBeCloseTo(0, 10)
    expect(grad[2]).toBeCloseTo(0, 10)
  })

  it('gradient points outward from origin for harmonic trap', () => {
    const config = makeConfig({ potentialType: 'harmonicTrap', mass: 1, harmonicOmega: 1 })
    const x = new Float64Array([0.5, -0.3, 0])
    const grad = new Float64Array(3)
    computeGradient(x, config, grad)
    // Gradient should have same sign as position
    expect(Math.sign(grad[0])).toBe(Math.sign(x[0]!))
    expect(Math.sign(grad[1])).toBe(Math.sign(x[1]!))
  })

  it('does not mutate position vector', () => {
    const config = makeConfig({ potentialType: 'harmonicTrap', mass: 1, harmonicOmega: 1 })
    const x = new Float64Array([1, 2, 3])
    const xCopy = new Float64Array(x)
    const grad = new Float64Array(3)
    computeGradient(x, config, grad)
    expect(x[0]).toBe(xCopy[0])
    expect(x[1]).toBe(xCopy[1])
    expect(x[2]).toBe(xCopy[2])
  })
})

describe('integrateOrbit', () => {
  it('conserves energy for harmonic oscillator', () => {
    const config = makeConfig({ potentialType: 'harmonicTrap', mass: 1, harmonicOmega: 1 })
    const x0 = new Float64Array([1, 0, 0])
    const p0 = new Float64Array([0, 1, 0])
    const orbitCfg = { ...DEFAULT_ORBIT_CONFIG, steps: 2000, dt: 0.001, sampleInterval: 100 }

    const trajectory = integrateOrbit(x0, p0, config, orbitCfg)

    expect(trajectory.energyDrift).toBeLessThan(1e-6)
    expect(trajectory.points.length).toBeGreaterThan(1)
    expect(trajectory.dim).toBe(3)
  })

  it('conserves energy for coupled anharmonic', () => {
    const config = makeConfig({
      potentialType: 'coupledAnharmonic',
      mass: 1,
      harmonicOmega: 1,
      anharmonicLambda: 0.5,
      latticeDim: 3,
    })
    const x0 = new Float64Array([0.5, 0.3, 0.2])
    const p0 = new Float64Array([0.1, 0.2, 0.3])
    const orbitCfg = { ...DEFAULT_ORBIT_CONFIG, steps: 5000, dt: 0.001, sampleInterval: 50 }

    const trajectory = integrateOrbit(x0, p0, config, orbitCfg)

    // Symplectic integrator should conserve energy well
    expect(trajectory.energyDrift).toBeLessThan(1e-4)
  })

  it('produces expected number of sample points', () => {
    const config = makeConfig({ potentialType: 'harmonicTrap' })
    const x0 = new Float64Array([1, 0, 0])
    const p0 = new Float64Array([0, 0.5, 0])
    const orbitCfg = { ...DEFAULT_ORBIT_CONFIG, steps: 100, dt: 0.01, sampleInterval: 10 }

    const trajectory = integrateOrbit(x0, p0, config, orbitCfg)

    // Initial point + 100/10 = 10 sampled points = 11 total
    expect(trajectory.points.length).toBe(11)
  })
})

describe('generateOrbitsAtEnergy', () => {
  it('generates requested number of orbits', () => {
    const config = makeConfig({ potentialType: 'harmonicTrap', mass: 1, harmonicOmega: 1 })
    const orbitCfg = { ...DEFAULT_ORBIT_CONFIG, steps: 100, numOrbits: 4 }
    const orbits = generateOrbitsAtEnergy(1.0, config, orbitCfg)
    expect(orbits).toHaveLength(4)
  })

  it('orbits have approximately the target energy', () => {
    const config = makeConfig({ potentialType: 'harmonicTrap', mass: 1, harmonicOmega: 1 })
    const targetEnergy = 2.0
    const orbitCfg = { ...DEFAULT_ORBIT_CONFIG, steps: 100, numOrbits: 5 }
    const orbits = generateOrbitsAtEnergy(targetEnergy, config, orbitCfg)

    for (const orbit of orbits) {
      // Energy should be within 50% of target (initial conditions are random)
      expect(orbit.energy).toBeGreaterThan(0)
      expect(Math.abs(orbit.energy - targetEnergy) / targetEnergy).toBeLessThan(0.5)
    }
  })

  it('is reproducible with the same seed', () => {
    const config = makeConfig({ potentialType: 'coupledAnharmonic', anharmonicLambda: 1 })
    const orbitCfg = { ...DEFAULT_ORBIT_CONFIG, steps: 50, numOrbits: 2, seed: 42 }

    const orbitsA = generateOrbitsAtEnergy(1.0, config, orbitCfg)
    const orbitsB = generateOrbitsAtEnergy(1.0, config, orbitCfg)

    expect(orbitsA[0]!.energy).toBe(orbitsB[0]!.energy)
    expect(orbitsA[0]!.points[0]!.x[0]).toBe(orbitsB[0]!.points[0]!.x[0])
  })

  it('falls back to origin when no classically allowed region (very high barrier)', () => {
    // A barrier at the origin with very high potential everywhere
    // means V(x) > targetEnergy for all sampled positions → fallback path
    const config = makeConfig({
      potentialType: 'barrier',
      barrierCenter: 0,
      barrierWidth: 1000, // absurdly wide barrier
      barrierHeight: 1e10,
    })
    const orbitCfg = { ...DEFAULT_ORBIT_CONFIG, steps: 10, numOrbits: 1, seed: 1 }
    const orbits = generateOrbitsAtEnergy(1.0, config, orbitCfg)

    expect(orbits).toHaveLength(1)
    // Fallback: starts at origin with all kinetic energy along dim 0
    expect(orbits[0]!.points[0]!.x[0]).toBe(0)
    expect(orbits[0]!.points[0]!.p[0]).toBeGreaterThan(0)
  })

  it('handles zero target energy without NaN', () => {
    const config = makeConfig({ potentialType: 'free' })
    const orbitCfg = { ...DEFAULT_ORBIT_CONFIG, steps: 10, numOrbits: 1, seed: 1 }
    const orbits = generateOrbitsAtEnergy(0, config, orbitCfg)

    expect(orbits).toHaveLength(1)
    expect(Number.isFinite(orbits[0]!.energy)).toBe(true)
    expect(Number.isFinite(orbits[0]!.energyDrift)).toBe(true)
  })

  it('generates orbits for radialDoubleWell potential', () => {
    const config = makeConfig({
      potentialType: 'radialDoubleWell',
      radialWellInner: 1.0,
      radialWellOuter: 3.0,
      radialWellDepth: 1.0,
      radialWellTilt: 0,
      mass: 1,
      harmonicOmega: 1,
    })
    const orbitCfg = { ...DEFAULT_ORBIT_CONFIG, steps: 200, numOrbits: 2, dt: 0.005, seed: 99 }
    const orbits = generateOrbitsAtEnergy(2.0, config, orbitCfg)
    expect(orbits).toHaveLength(2)
    for (const orbit of orbits) {
      expect(Number.isFinite(orbit.energy)).toBe(true)
      expect(orbit.points.length).toBeGreaterThan(0)
    }
  })
})
