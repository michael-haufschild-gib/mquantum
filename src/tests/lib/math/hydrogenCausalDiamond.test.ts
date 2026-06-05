import { describe, expect, it } from 'vitest'

import type { HydrogenCausalDiamondParams } from '@/lib/math/hydrogenCausalDiamond'
import {
  causalDiamondHorizonGain,
  modularClock,
  sechSquaredFromTau,
  warpCausalDiamondCoordinate,
} from '@/lib/math/hydrogenCausalDiamond'

const params: HydrogenCausalDiamondParams = {
  horizonRadius: 4,
  compressionK: 0.8,
  shellGain: 0,
  shellCenter: 0.8,
  shellWidth: 0.08,
  holonomyStrength: 0,
  holonomyMix: 0,
}

describe('hydrogen causal-diamond modular orbital math', () => {
  it('keeps modularClock monotonic and finite on clamped [0, 1)', () => {
    const us = [0, 0.15, 0.5, 0.85, 0.999, 1, 1.5]
    const taus = us.map((u) => modularClock(u))

    for (const tau of taus) {
      expect(Number.isFinite(tau)).toBe(true)
    }
    for (let i = 1; i < 5; i++) {
      expect(taus[i]).toBeGreaterThan(taus[i - 1]!)
    }
    expect(taus[taus.length - 1]).toBe(taus[taus.length - 2])
  })

  it('makes sech squared positive and decreasing toward the horizon', () => {
    const tau0 = modularClock(0)
    const tauMid = modularClock(0.6)
    const tauNear = modularClock(0.95)

    const s0 = sechSquaredFromTau(tau0)
    const sMid = sechSquaredFromTau(tauMid)
    const sNear = sechSquaredFromTau(tauNear)

    expect(s0).toBeCloseTo(1, 12)
    expect(sMid).toBeGreaterThan(0)
    expect(sNear).toBeGreaterThan(0)
    expect(sMid).toBeLessThan(s0)
    expect(sNear).toBeLessThan(sMid)
  })

  it('compresses positive-radius coordinates without producing non-finite values', () => {
    const source = [2.2, -1.1, 0.6]
    const warped = warpCausalDiamondCoordinate(source, params)
    const sourceRadius = Math.hypot(...source)
    const warpedRadius = Math.hypot(...warped)

    expect(warped.every(Number.isFinite)).toBe(true)
    expect(warpedRadius).toBeLessThan(sourceRadius)
  })

  it('applies finite horizon gain with shell amplification inside causal diamond', () => {
    const shellParams = { ...params, shellGain: 4, shellCenter: 0.75, shellWidth: 0.05 }
    const centerGain = causalDiamondHorizonGain(0, shellParams)
    const shellGain = causalDiamondHorizonGain(0.75, shellParams)
    const nearHorizonGain = causalDiamondHorizonGain(0.98, shellParams)

    expect(centerGain).toBeCloseTo(0.18, 8)
    expect(shellGain).toBeGreaterThan(centerGain)
    expect(nearHorizonGain).toBeGreaterThan(0)
    expect(nearHorizonGain).toBeLessThan(shellGain)
  })

  it('changes 4D orientation while preserving compressed transverse norm', () => {
    const holonomyParams: HydrogenCausalDiamondParams = {
      ...params,
      compressionK: 0.2,
      holonomyStrength: 3.5,
      holonomyMix: 1,
    }
    const source = [1.2, -0.5, 0.8, 1.6]
    const compressedOnly = warpCausalDiamondCoordinate(source, {
      ...holonomyParams,
      holonomyStrength: 0,
    })
    const braided = warpCausalDiamondCoordinate(source, holonomyParams)

    const transverseBefore = Math.hypot(...compressedOnly.slice(0, 4))
    const transverseAfter = Math.hypot(...braided.slice(0, 4))

    expect(braided[0]).not.toBeCloseTo(compressedOnly[0]!, 6)
    expect(braided[3]).not.toBeCloseTo(compressedOnly[3]!, 6)
    expect(transverseAfter).toBeCloseTo(transverseBefore, 10)
  })
})
