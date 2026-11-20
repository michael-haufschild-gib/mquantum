import { describe, expect, it } from 'vitest'

import { getAvailableColorAlgorithms } from '@/lib/colors/palette'
import { horizonPreset, validHorizon } from '@/lib/geometry/extended/modularHorizon'
import {
  getQuantumTypeEntry,
  supportsSchroedingerSurfaceMode,
  supportsSharedVolumeEffects,
} from '@/lib/geometry/registry'
import {
  detectorBasis,
  detectorChart,
  fidelity,
  frequencies,
  horizonPhases,
} from '@/lib/physics/modularHorizon'
import { intersectExteriorShell, radialProfile } from '@/lib/physics/modularHorizon/exterior'
import { deserializeState, serializeState } from '@/lib/url/state-serializer'
import { mergeExtendedObjectStateForType } from '@/stores/utils/mergeWithDefaults'

describe('modular horizon', () => {
  it('reproduces the computed three-mode recurrence and two-mode beat', () => {
    expect(fidelity([1, 1, 1], 0.941988)).toBeCloseTo(0.02457288, 7)
    expect(fidelity([1, 1, 1], 11.844573)).toBeCloseTo(0.99361894, 7)
    expect(fidelity([1, 1, 0], (2 * Math.PI) / (frequencies[1]! - frequencies[0]!))).toBeCloseTo(
      1,
      12
    )
    expect(fidelity([0, 1, 0], 51)).toBe(1)
  })
  it('averages over one horocycle period in the picked chart', () => {
    const pin: [number, number] = [-0.82, 0.1]
    const chart = detectorChart(pin)
    expect(chart.y).toBeGreaterThanOrEqual(Math.sqrt(3) / 2)
    const [a, b, c, d] = chart.matrix
    expect(a! * d! - b! * c!).toBe(1)
    expect(detectorBasis(pin, 0)).toEqual(detectorBasis(pin, 1e-10))
    expect(detectorBasis(pin, 1)).toEqual([0, 0, 0])
    // Centered interval mean versus point sampling along the same canonical lift.
    const { x, y } = detectorChart([0, 0])
    const expected = [0, 0, 0]
    for (let i = 0; i < 128; i++) {
      const re = x + 0.5 * ((i + 0.5) / 128 - 0.5) - 0.17
      const den = re * re + (y + 1.3) ** 2
      const point: [number, number] = [(re * re + y * y - 1.3 ** 2) / den, (-2.6 * re) / den]
      detectorBasis(point, 0).forEach((v, j) => (expected[j] = expected[j]! + v / 128))
    }
    detectorBasis([0, 0], 0.5).forEach((v, j) => expect(v).toBeCloseTo(expected[j]!, 3))
  })
  it('exposes the dedicated field renderer and gates shared effects and colors', () => {
    expect(getQuantumTypeEntry('modularHorizon')?.dimensions).toMatchObject({ min: 2, max: 3 })
    for (let dimension = 2; dimension <= 3; dimension++) {
      expect(
        supportsSchroedingerSurfaceMode({
          objectType: 'schroedinger',
          quantumMode: 'modularHorizon',
          dimension,
          representation: 'position',
        })
      ).toBe(false)
    }
    expect(supportsSharedVolumeEffects('schroedinger', 'modularHorizon')).toBe(false)
    expect(supportsSharedVolumeEffects('schroedinger', 'harmonicOscillator')).toBe(true)
    expect(
      getAvailableColorAlgorithms('modularHorizon')
        .map((o) => o.value)
        .sort()
    ).toEqual(['blackbody', 'densityContours', 'phaseCyclicUniform', 'phaseDensity', 'viridis'])
  })
  it('picks the same angular coordinate on distinct exterior shells', () => {
    const x = 0.24,
      y = -0.37
    const norm2 = x * x + y * y
    for (const r of [1.02, 2, 4]) {
      const denom = r * (1 + norm2) + 1 - norm2
      const bx = (2 * r * x) / denom,
        by = (2 * r * y) / denom
      const hit = intersectExteriorShell([bx, by, 2], [0, 0, -1], r, false)
      expect(hit?.[0]).toBeCloseTo(x, 11)
      expect(hit?.[1]).toBeCloseTo(y, 11)
      expect(intersectExteriorShell([bx, by, 2], [0, 0, -1], r, true)).toBeNull()
    }
    expect(intersectExteriorShell([2, 0, 2], [0, 0, -1], 2, false)).toBeNull()
    expect(intersectExteriorShell([0, 0, 2], [0, 0, 1], 2, false)).toBeNull()
  })
  it('matches the launch at r=2 and satisfies the complex radial master equation', () => {
    expect(radialProfile(2)).toEqual({ gain: 1, delay: 0 })
    // r²F f″ + 2r f′ + [w(w+1) − 2 − w²r²/F]f = 0, F = r²−1.
    for (const nu of frequencies) {
      const mode = (r: number) => {
        const { gain, delay } = radialProfile(r)
        return [gain * Math.cos(-nu * delay), gain * Math.sin(-nu * delay)]
      }
      for (const r of [1.2, 2, 3.7]) {
        const h = 1e-5,
          F = r * r - 1
        const left = mode(r - h),
          mid = mode(r),
          right = mode(r + h)
        const a = -0.25 - nu * nu - 2 - ((0.25 - nu * nu) * r * r) / F
        const b = (-nu * r * r) / F
        for (const j of [0, 1]) {
          const d1 = (right[j]! - left[j]!) / (2 * h)
          const d2 = (right[j]! - 2 * mid[j]! + left[j]!) / (h * h)
          const residual =
            r * r * F * d2 + 2 * r * d1 + a * mid[j]! + (j === 0 ? -b * mid[1]! : b * mid[0]!)
          expect(Math.abs(residual)).toBeLessThan(0.01)
        }
      }
    }
    const { delay } = radialProfile(1.2)
    const phases = horizonPhases([0, 1, 1], 0, delay)
    expect(phases[1]).toBe(0)
    expect(phases[2]).toBeCloseTo(-(frequencies[2]! - frequencies[1]!) * delay, 12)
    expect(Math.abs(phases[2]!)).toBeGreaterThan(0.1)
  })
  it('normalizes unsupported surface and phase-space flags on scene load', () => {
    const loaded = mergeExtendedObjectStateForType(
      {
        schroedinger: {
          quantumMode: 'modularHorizon',
          isoEnabled: true,
          representation: 'wigner',
          modularHorizon: horizonPreset('exactBeat'),
        },
      },
      'schroedinger'
    )
    expect(loaded.schroedinger).toMatchObject({
      isoEnabled: false,
      representation: 'position',
      modularHorizon: { preset: 'exactBeat', weights: [1, 1, 0] },
    })
  })
  it('round-trips custom detector and populations and rejects malformed inputs', () => {
    const config = horizonPreset('fadingReturn')
    config.width = 0.7
    config.cutaway = true
    config.probeRadius = 2.67
    config.pin = [0.32, -0.45]
    expect(
      deserializeState(
        serializeState({
          objectType: 'schroedinger',
          quantumMode: 'modularHorizon',
          dimension: 3,
          modularHorizon: config,
        })
      ).modularHorizon
    ).toEqual(config)
    expect(validHorizon({ weights: 'abc', pin: [NaN, 0] })).toEqual(horizonPreset('silentReturn'))
  })
})
