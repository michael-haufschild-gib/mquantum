import { describe, expect, it } from 'vitest'

import { computeCauchyLoomScalar } from '@/lib/physics/freeScalar/cauchyLoom'
import { FREE_SCALAR_PRESETS } from '@/lib/physics/freeScalar/presets'

describe('free scalar Cauchy Loom observable', () => {
  it('vanishes for collinear canonical gradients', () => {
    const value = computeCauchyLoomScalar({
      gradPhi: [1, 2, 3],
      gradPi: [2, 4, 6],
      localEnergy: 1,
    })

    expect(value).toBe(0)
  })

  it('lights up independent gradients and remains bounded', () => {
    const value = computeCauchyLoomScalar({
      gradPhi: [1, 0, 0],
      gradPi: [0, 1, 0],
      localEnergy: 1,
      gain: 2.8,
    })

    expect(value).toBeGreaterThan(0)
    expect(value).toBeLessThanOrEqual(1)
    expect(Number.isFinite(value)).toBe(true)
  })

  it('suppresses the same canonical area when local energy is larger', () => {
    const lowEnergy = computeCauchyLoomScalar({
      gradPhi: [1, 0, 0],
      gradPi: [0, 1, 0],
      localEnergy: 1,
    })
    const highEnergy = computeCauchyLoomScalar({
      gradPhi: [1, 0, 0],
      gradPi: [0, 1, 0],
      localEnergy: 10,
    })

    expect(lowEnergy).toBeGreaterThan(highEnergy)
  })

  it('clamps and applies the energy visibility gate', () => {
    const base = {
      gradPhi: [1, 0, 0],
      gradPi: [0, 1, 0],
      localEnergy: 1,
    }

    expect(computeCauchyLoomScalar({ ...base, energyGate: 0 })).toBe(0)
    expect(computeCauchyLoomScalar({ ...base, energyGate: -2 })).toBe(0)
    expect(computeCauchyLoomScalar({ ...base, energyGate: 10 })).toBe(
      computeCauchyLoomScalar({ ...base, energyGate: 1 })
    )
  })

  it('uses angular-shell carrier contrast to carve filaments', () => {
    const base = {
      gradPhi: [1, 0, 0],
      gradPi: [0, 1, 0],
      localEnergy: 1,
      radius: 0,
      phiXZ: 0,
      simTime: 0,
    }

    const brightCarrier = computeCauchyLoomScalar({ ...base, phiXY: 0 })
    const darkCarrier = computeCauchyLoomScalar({ ...base, phiXY: Math.PI / 3 })

    expect(brightCarrier).toBeGreaterThan(darkCarrier)
  })

  it('registers a preset that enters the Cauchy Loom view directly', () => {
    const preset = FREE_SCALAR_PRESETS.find((candidate) => candidate.id === 'cauchyLoomWeave')
    if (!preset) throw new Error('cauchyLoomWeave preset missing')

    expect(preset.overrides.initialCondition).toBe('cauchyLoomWeave')
    expect(preset.overrides.fieldView).toBe('cauchyLoom')
    expect(preset.overrides.latticeDim).toBe(3)
    expect(preset.overrides.gridSize).toEqual([64, 64, 64])
    expect(preset.overrides.modeK).toEqual([4, 5, 7])
    expect(preset.overrides.selfInteractionEnabled).toBe(false)
    expect(preset.overrides.absorberEnabled).toBe(false)
    expect(preset.renderingOverrides).toEqual({
      densityGain: 2.6,
      densityContrast: 3.4,
      colorAlgorithm: 'phaseDensity',
    })
  })
})
