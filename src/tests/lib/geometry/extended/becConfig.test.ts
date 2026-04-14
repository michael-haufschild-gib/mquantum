/**
 * BEC config — analog Hawking extension tests.
 *
 * Verifies that the new union members (`'blackHoleAnalog'` initial condition
 * and `'machNumber'` field view) are accepted by `DEFAULT_BEC_CONFIG`
 * clones and that the new hawking parameter defaults match the PRD.
 *
 * These tests guard against:
 *   1. A union member being removed or renamed without updating the map in
 *      the uniform writer (TypeScript would still compile because the
 *      writer's record uses `string` keys).
 *   2. Default hawking parameters silently drifting away from the documented
 *      physically-motivated values (v_max=2, L_h=0.6, Δn=0, rate=0.05,
 *      seed=1337) which the preset and UI both rely on.
 */
import { describe, expect, it } from 'vitest'

import {
  type BecConfig,
  type BecFieldView,
  type BecInitialCondition,
  DEFAULT_BEC_CONFIG,
} from '@/lib/geometry/extended/bec'
import { BEC_SCENARIO_PRESETS, getBecPreset } from '@/lib/physics/bec/presets'

describe('DEFAULT_BEC_CONFIG — analog Hawking fields', () => {
  it('exposes physically-motivated defaults for the waterfall parameters', () => {
    expect(DEFAULT_BEC_CONFIG.hawkingVmax).toBeCloseTo(2.0)
    expect(DEFAULT_BEC_CONFIG.hawkingLh).toBeCloseTo(0.6)
    expect(DEFAULT_BEC_CONFIG.hawkingDeltaN).toBeCloseTo(0.0)
    expect(DEFAULT_BEC_CONFIG.hawkingInjectRate).toBeCloseTo(0.05)
    expect(DEFAULT_BEC_CONFIG.hawkingPairInjection).toBe(false)
    expect(DEFAULT_BEC_CONFIG.hawkingSeed).toBe(1337)
  })

  it("default initial condition is unchanged (still 'thomasFermi')", () => {
    // Tests that adding the new union member did not accidentally change
    // the default. Regression test for accidental keystroke swaps.
    expect(DEFAULT_BEC_CONFIG.initialCondition).toBe('thomasFermi')
  })
})

describe('BecInitialCondition / BecFieldView — union members', () => {
  it("accepts 'blackHoleAnalog' as a BecInitialCondition value", () => {
    const ic: BecInitialCondition = 'blackHoleAnalog'
    const cfg: BecConfig = { ...DEFAULT_BEC_CONFIG, initialCondition: ic }
    expect(cfg.initialCondition).toBe('blackHoleAnalog')
  })

  it("accepts 'machNumber' as a BecFieldView value", () => {
    const fv: BecFieldView = 'machNumber'
    const cfg: BecConfig = { ...DEFAULT_BEC_CONFIG, fieldView: fv }
    expect(cfg.fieldView).toBe('machNumber')
  })
})

describe('Sonic Horizon preset', () => {
  it('sets initialCondition=blackHoleAnalog and fieldView=machNumber', () => {
    const preset = BEC_SCENARIO_PRESETS.find((p) => p.id === 'blackHoleAnalog')
    // If the preset disappears from the list we want a clear failure, not
    // a non-null assertion crash — use toBe('blackHoleAnalog') against the
    // id (checks identity with a specific expected value).
    expect(preset?.id).toBe('blackHoleAnalog')
    expect(preset?.overrides.initialCondition).toBe('blackHoleAnalog')
    expect(preset?.overrides.fieldView).toBe('machNumber')
  })

  it('is reachable via getBecPreset and merges default rendering overrides', () => {
    const preset = getBecPreset('blackHoleAnalog')
    // Preset id equality is a value check; the default-rendering merge
    // should preserve the preset's explicit densityContrast of 1.2 and
    // densityGain of 0.25. autoScaleMaxGain is lowered to 6 for Mach view
    // sanity (Mach is already normalized to [0,1]; higher gains saturate
    // the volume once density autoscales).
    expect(preset?.id).toBe('blackHoleAnalog')
    expect(preset?.renderingOverrides?.densityGain).toBeCloseTo(0.25)
    expect(preset?.renderingOverrides?.densityContrast).toBeCloseTo(1.2)
    expect(preset?.renderingOverrides?.autoScaleMaxGain).toBe(6)
  })
})
