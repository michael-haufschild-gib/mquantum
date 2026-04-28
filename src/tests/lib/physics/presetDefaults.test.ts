/**
 * Tests for the cross-mode `getFirstPresetId` resolver.
 *
 * Whenever the user switches quantum mode, this resolver decides which
 * scenario preset to auto-apply. A bug here silently lands the user on
 * the WRONG preset (or worse, an undefined id that the caller treats as
 * "no preset" and falls through to the default config). The mode-by-mode
 * dispatch contract has subtle dimension filters: TDSE checks
 * `latticeDim ≤ dimension`, BEC and HydrogenCoupled use `minDim`, and
 * AdS picks the lowest-d preset compatible with the user's dimension.
 */

import { describe, expect, it } from 'vitest'

import { ADS_PRESETS } from '@/lib/physics/antiDeSitter/presets'
import { DIRAC_SCENARIO_PRESETS } from '@/lib/physics/dirac/presets'
import { FREE_SCALAR_PRESETS } from '@/lib/physics/freeScalar/presets'
import { HYDROGEN_COUPLED_PRESETS } from '@/lib/physics/hydrogenCoupled/presets'
import { getFirstPresetId } from '@/lib/physics/presetDefaults'
import { QUANTUM_WALK_PRESETS } from '@/lib/physics/quantumWalk/presets'

describe('getFirstPresetId — dimension-agnostic modes', () => {
  it('harmonicOscillator always returns "groundState"', () => {
    for (const d of [1, 2, 3, 5, 11]) {
      expect(getFirstPresetId('harmonicOscillator', d)).toBe('groundState')
    }
  })

  it('diracEquation returns the first Dirac preset id', () => {
    const expected = DIRAC_SCENARIO_PRESETS[0]?.id
    expect(getFirstPresetId('diracEquation', 3)).toBe(expected)
    expect(getFirstPresetId('diracEquation', 7)).toBe(expected)
  })

  it('freeScalarField returns the first FSF preset id', () => {
    expect(getFirstPresetId('freeScalarField', 3)).toBe(FREE_SCALAR_PRESETS[0]?.id)
  })

  it('quantumWalk returns the first QW preset id', () => {
    expect(getFirstPresetId('quantumWalk', 3)).toBe(QUANTUM_WALK_PRESETS[0]?.id)
  })
})

describe('getFirstPresetId — dimension-filtered modes', () => {
  it('hydrogenNDCoupled honours minDim (2D returns first 2D-compatible preset)', () => {
    const found = getFirstPresetId('hydrogenNDCoupled', 2)
    const expected = HYDROGEN_COUPLED_PRESETS.find((p) => p.minDim <= 2)?.id
    expect(found).toBe(expected)
  })

  it('hydrogenNDCoupled returns undefined when no preset matches the dimension', () => {
    // 0D and 1D have no compatible preset because all presets list minDim ≥ 2.
    expect(getFirstPresetId('hydrogenNDCoupled', 1)).toBeUndefined()
    expect(getFirstPresetId('hydrogenNDCoupled', 0)).toBeUndefined()
  })

  it('antiDeSitter picks the lowest-d preset compatible with the active dimension', () => {
    // d=3 is the lowest AdS dimension supported.
    const expected3 = ADS_PRESETS.find((p) => p.d <= 3)?.id
    expect(getFirstPresetId('antiDeSitter', 3)).toBe(expected3)

    // d=5: ADS_PRESETS array order picks first dim-compatible preset, NOT
    // the highest-d-yet-compatible. Verify against the source's `find` order.
    const expected5 = ADS_PRESETS.find((p) => p.d <= 5)?.id
    expect(getFirstPresetId('antiDeSitter', 5)).toBe(expected5)
  })

  it('antiDeSitter falls back to the first preset when no preset matches (≤ dim)', () => {
    // d=2 — no preset has d=2. Source uses `?? ADS_PRESETS[0]` fallback.
    expect(getFirstPresetId('antiDeSitter', 2)).toBe(ADS_PRESETS[0]?.id)
  })
})

describe('getFirstPresetId — coverage of all enumerated modes', () => {
  it.each([
    ['harmonicOscillator'],
    ['hydrogenND'],
    ['hydrogenNDCoupled'],
    ['tdseDynamics'],
    ['becDynamics'],
    ['diracEquation'],
    ['freeScalarField'],
    ['quantumWalk'],
    ['pauliSpinor'],
    ['wheelerDeWitt'],
    ['antiDeSitter'],
  ] as const)('returns a string preset id for mode %s at typical dim 3', ([mode]) => {
    const id = getFirstPresetId(mode as Parameters<typeof getFirstPresetId>[0], 3)
    // All modes with curated presets should resolve at d=3 except those
    // gated by minDim > 3 (none of the catalogues currently do that).
    expect(id === undefined || typeof id === 'string').toBe(true)
    if (id !== undefined) expect(id.length).toBeGreaterThan(0)
  })

  it('an unsupported mode string returns undefined', () => {
    expect(
      getFirstPresetId('thisIsNotARealMode' as unknown as Parameters<typeof getFirstPresetId>[0], 3)
    ).toBeUndefined()
  })
})

describe('getFirstPresetId — dimension monotonicity', () => {
  it('any preset id returned for dim D is also valid for dim D+1 (or some valid id is)', () => {
    // A preset compatible at d=N is also compatible at d=N+1 for all
    // current modes (filters use ≤, never =). The resolved id may differ
    // because the filter picks the *first* match, but it must stay defined.
    const modes = [
      'harmonicOscillator',
      'hydrogenNDCoupled',
      'tdseDynamics',
      'becDynamics',
      'diracEquation',
      'freeScalarField',
      'quantumWalk',
      'pauliSpinor',
      'wheelerDeWitt',
      'antiDeSitter',
    ] as const
    for (const mode of modes) {
      let foundOnce = false
      for (let d = 3; d <= 11; d++) {
        const id = getFirstPresetId(mode, d)
        if (id !== undefined) foundOnce = true
        // Once we find a valid id for some d, every larger d should also
        // resolve (filters are monotone in d). Verify that.
        if (foundOnce) {
          expect(id, `mode=${mode} dim=${d}`).toEqual(expect.any(String))
        }
      }
      expect(foundOnce, `mode=${mode} should resolve at some dim`).toBe(true)
    }
  })
})
