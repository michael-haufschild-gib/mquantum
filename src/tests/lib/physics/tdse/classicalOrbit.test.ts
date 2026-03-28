import { describe, expect, it } from 'vitest'

import { DEFAULT_TDSE_CONFIG, type TdseConfig } from '@/lib/geometry/extended/tdse'
import {
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
})
