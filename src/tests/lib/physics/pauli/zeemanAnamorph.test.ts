import { describe, expect, it } from 'vitest'

import {
  computeZeemanAnamorphScalar,
  relativePhaseFromSpinor,
  relativePhaseGradientMagnitude,
  wrapPhaseDelta,
} from '@/lib/physics/pauli/zeemanAnamorph'

const TAU = 2 * Math.PI

describe('Pauli Zeeman Anamorph CPU mirror', () => {
  it('wraps 2pi-equivalent phase jumps near zero and preserves signed pi/2', () => {
    expect(wrapPhaseDelta(TAU + 1e-6)).toBeCloseTo(1e-6, 12)
    expect(wrapPhaseDelta(-TAU - 1e-6)).toBeCloseTo(-1e-6, 12)
    expect(wrapPhaseDelta(Math.PI / 2)).toBeCloseTo(Math.PI / 2, 12)
    expect(wrapPhaseDelta(-Math.PI / 2)).toBeCloseTo(-Math.PI / 2, 12)
  })

  it('computes relative phase from simple spinors as arg(conj(up) * down)', () => {
    expect(relativePhaseFromSpinor({ re: 1, im: 0 }, { re: 0, im: 1 })).toBeCloseTo(Math.PI / 2, 12)
    expect(relativePhaseFromSpinor({ re: 0, im: 1 }, { re: 1, im: 0 })).toBeCloseTo(
      -Math.PI / 2,
      12
    )
    expect(relativePhaseFromSpinor({ re: 1, im: 1 }, { re: 1, im: -1 })).toBeCloseTo(
      -Math.PI / 2,
      12
    )
  })

  it('uses wrapped central phase differences and per-axis spacing for gradient magnitude', () => {
    const gradient = relativePhaseGradientMagnitude([
      { plus: TAU - 0.1, minus: 0.1, spacing: 0.5 },
      { plus: Math.PI / 2, minus: -Math.PI / 2, spacing: 2 },
    ])

    const dX = -0.2 / (2 * 0.5)
    const dY = Math.PI / (2 * 2)
    expect(gradient).toBeCloseTo(Math.hypot(dX, dY), 12)
  })

  it('rejects zero or nonfinite spacing instead of producing invalid gradients', () => {
    expect(() => relativePhaseGradientMagnitude([{ plus: 1, minus: 0, spacing: 0 }])).toThrow(
      RangeError
    )
    expect(() =>
      relativePhaseGradientMagnitude([{ plus: 1, minus: 0, spacing: Number.NaN }])
    ).toThrow(RangeError)
  })

  it('is zero for spin parallel to field, zero phase shear, and zero field', () => {
    expect(
      computeZeemanAnamorphScalar({
        spin: [0, 0, 1],
        field: [0, 0, 3],
        phaseGradientMagnitude: 4,
        minSpacing: 0.25,
        densityNorm: 1,
      })
    ).toBeCloseTo(0, 12)

    expect(
      computeZeemanAnamorphScalar({
        spin: [1, 0, 0],
        field: [0, 0, 3],
        phaseGradientMagnitude: 0,
        minSpacing: 0.25,
        densityNorm: 1,
      })
    ).toBeCloseTo(0, 12)

    expect(
      computeZeemanAnamorphScalar({
        spin: [1, 0, 0],
        field: [0, 0, 0],
        phaseGradientMagnitude: 4,
        minSpacing: 0.25,
        densityNorm: 1,
      })
    ).toBe(0)
  })

  it('grows with transverse spin and phase shear and clamps densityNorm to [0,1]', () => {
    const weakShear = computeZeemanAnamorphScalar({
      spin: [1, 0, 0],
      field: [0, 0, 1],
      phaseGradientMagnitude: 1,
      minSpacing: 0.25,
      densityNorm: 1,
    })
    const strongShear = computeZeemanAnamorphScalar({
      spin: [1, 0, 0],
      field: [0, 0, 1],
      phaseGradientMagnitude: 4,
      minSpacing: 0.25,
      densityNorm: 1,
    })
    const halfTransverse = computeZeemanAnamorphScalar({
      spin: [Math.SQRT1_2, 0, Math.SQRT1_2],
      field: [0, 0, 1],
      phaseGradientMagnitude: 4,
      minSpacing: 0.25,
      densityNorm: 1,
    })

    expect(strongShear).toBeGreaterThan(weakShear)
    expect(strongShear).toBeGreaterThan(halfTransverse)

    const overDense = computeZeemanAnamorphScalar({
      spin: [1, 0, 0],
      field: [0, 0, 1],
      phaseGradientMagnitude: 4,
      minSpacing: 0.25,
      densityNorm: 7,
    })
    const exactlyDense = computeZeemanAnamorphScalar({
      spin: [1, 0, 0],
      field: [0, 0, 1],
      phaseGradientMagnitude: 4,
      minSpacing: 0.25,
      densityNorm: 1,
    })
    const negativeDense = computeZeemanAnamorphScalar({
      spin: [1, 0, 0],
      field: [0, 0, 1],
      phaseGradientMagnitude: 4,
      minSpacing: 0.25,
      densityNorm: -1,
    })

    expect(overDense).toBeCloseTo(exactlyDense, 12)
    expect(negativeDense).toBe(0)
  })
})
