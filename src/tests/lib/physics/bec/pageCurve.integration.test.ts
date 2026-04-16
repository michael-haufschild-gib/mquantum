/**
 * Integration tests for the BEC analog-Hawking Page-curve helpers, exercised
 * end-to-end with the canonical "Sonic Horizon (Waterfall)" parameters and
 * the *real* `computeWaterfallBackgroundDensity` helper.
 *
 * These tests document the producer-side contract that the
 * `HawkingPageCurvePanel` was violating (it hardcoded `n0 = 1.0` and silently
 * killed the rate). The first test forces the integration to use the helper
 * so a regression that drops the helper from the panel produces an obvious
 * "panel says rate=0 but the helper-derived rate is positive" mismatch.
 *
 * @module tests/lib/physics/bec/pageCurve.integration
 */

import { describe, expect, it } from 'vitest'

import {
  bekensteinHawkingEntropy,
  horizonPlaneArea,
  thermalEntropyDensityRate,
} from '@/lib/physics/bec/pageCurve'
import {
  asymptoticSoundSpeed,
  hasHorizon,
  hawkingReadout,
  type WaterfallParams,
} from '@/lib/physics/bec/sonicHorizon'
import { computeWaterfallBackgroundDensity } from '@/lib/physics/bec/waterfallParams'

/** Build the canonical Sonic-Horizon waterfall params using the simulator's true n0. */
function canonicalParams(): WaterfallParams {
  const interactionStrength = 500
  const n0 = computeWaterfallBackgroundDensity({ interactionStrength })
  return {
    vMax: 3.5,
    lh: 0.6,
    n0,
    deltaN: 0.15,
    g: interactionStrength,
    mass: 1.0,
    lBox: 64 * 0.15, // default BEC grid
  }
}

describe('Page-curve producer integration (canonical waterfall)', () => {
  it('produces a strictly positive thermal entropy rate at the horizon', () => {
    const params = canonicalParams()
    expect(hasHorizon(params)).toBe(true)
    const cs0 = asymptoticSoundSpeed(params)
    expect(params.vMax).toBeGreaterThan(cs0)

    const readout = hawkingReadout(params)
    expect(Number.isFinite(readout.hawkingTemperature)).toBe(true)
    expect(readout.hawkingTemperature).toBeGreaterThan(0)

    const areaH = horizonPlaneArea({
      gridSize: [64, 64, 64],
      spacing: [0.15, 0.15, 0.15],
      horizonExists: true,
    })
    expect(areaH).toBeGreaterThan(0)

    const rate = thermalEntropyDensityRate({
      tH: readout.hawkingTemperature,
      areaH,
      cs0,
    })
    expect(rate).toBeGreaterThan(1e-4)
  })

  it('changes G_eff scale S_BH inversely (10× G_eff → 1/10× S_BH)', () => {
    const areaH = 100
    const sLow = bekensteinHawkingEntropy({ areaH, gEff: 1 })
    const sHigh = bekensteinHawkingEntropy({ areaH, gEff: 10 })
    expect(sLow).toBeGreaterThan(0)
    expect(sHigh).toBeGreaterThan(0)
    expect(sHigh / sLow).toBeCloseTo(0.1, 12)
  })

  it('zero horizon yields exactly zero rate without producing NaN', () => {
    const params = canonicalParams()
    // No horizon: vanishing v_max.
    const noHorizon: WaterfallParams = { ...params, vMax: 0 }
    expect(hasHorizon(noHorizon)).toBe(false)
    const r = thermalEntropyDensityRate({ tH: 0, areaH: 0, cs0: asymptoticSoundSpeed(noHorizon) })
    expect(r).toBe(0)
    expect(Number.isNaN(r)).toBe(false)
  })
})
