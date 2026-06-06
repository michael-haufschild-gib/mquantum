import { describe, expect, it } from 'vitest'

import {
  computeFockLantern,
  type FockLanternInput,
} from '@/lib/physics/harmonicOscillator/fockLantern'

const baseInput: FockLanternInput = {
  position: [0, 0, 0],
  rho: 0.4,
  peakDensity: 1,
  phase: -1.7,
  gradient: [0, 1, 0],
  boundingRadius: 1,
  time: 0,
  strength: 1.35,
  cellScale: 5.4,
  parityBias: 0.72,
}

describe('computeFockLantern', () => {
  it('is exact identity in density tails and saturated density cores', () => {
    expect(computeFockLantern({ ...baseInput, rho: 0 })).toEqual({
      emissionGain: 1,
      opacityScale: 1,
      lantern: 0,
    })
    expect(computeFockLantern({ ...baseInput, rho: 1.9 })).toEqual({
      emissionGain: 1,
      opacityScale: 1,
      lantern: 0,
    })
  })

  it('lights parity-cell centers and hollows parity-cell voids', () => {
    const center = computeFockLantern(baseInput)
    const voidCell = computeFockLantern({
      ...baseInput,
      position: [0.5 / baseInput.cellScale, 0, 0],
      phase: 0,
      gradient: [1, 0, 0],
    })

    expect(center.lantern).toBeGreaterThan(0.5)
    expect(center.emissionGain).toBeGreaterThan(2.5)
    expect(center.opacityScale).toBe(1)
    expect(voidCell.lantern).toBeLessThan(1e-6)
    expect(voidCell.emissionGain).toBeCloseTo(1)
    expect(voidCell.opacityScale).toBeLessThan(0.6)
    expect(voidCell.opacityScale).toBeGreaterThanOrEqual(0.35)
  })

  it('uses radial-gradient alignment as a physical lantern gate', () => {
    const aligned = computeFockLantern({
      ...baseInput,
      position: [0.2, 0, 0],
      phase: 0,
      gradient: [1, 0, 0],
    })
    const tangential = computeFockLantern({
      ...baseInput,
      position: [0.2, 0, 0],
      phase: 0,
      gradient: [0, 1, 0],
    })

    expect(aligned.lantern).toBeGreaterThan(tangential.lantern * 2)
    expect(aligned.emissionGain).toBeGreaterThan(tangential.emissionGain)
  })

  it('clamps unsafe strength and cell-shape inputs to bounded render gains', () => {
    const result = computeFockLantern({
      ...baseInput,
      strength: 99,
      cellScale: 999,
      parityBias: -10,
    })

    expect(result.lantern).toBeGreaterThanOrEqual(0)
    expect(result.lantern).toBeLessThanOrEqual(1)
    expect(result.emissionGain).toBeGreaterThanOrEqual(1)
    expect(result.emissionGain).toBeLessThanOrEqual(6.6)
    expect(result.opacityScale).toBeGreaterThanOrEqual(0.35)
    expect(result.opacityScale).toBeLessThanOrEqual(1)
  })
})
