/**
 * Tests for the pure BEC waterfall/background helpers.
 *
 * `computeWaterfallBackgroundDensity` is the single source of truth for the
 * simulator's n₀ — shared between the HUD analytic readout, the page-curve
 * integrator, and the BEC config mapper that seeds the GPU init shader. A
 * regression here would silently desynchronise CPU analytics from the GPU
 * simulation, which is exactly the failure mode that drove its extraction.
 */

import { describe, expect, it } from 'vitest'

import { DEFAULT_TDSE_CONFIG } from '@/lib/geometry/extended/tdse'
import {
  buildWaterfallParams,
  computeWaterfallBackgroundDensity,
  resolveBecMass,
} from '@/lib/physics/bec/waterfallParams'

describe('computeWaterfallBackgroundDensity', () => {
  it('matches the builder μ override: n₀ = max(g·0.01, 1)/g for the preset g=500', () => {
    // Builder path: mu = max(500*0.01, 1.0) = 5  ⇒  n₀ = mu / g = 0.01
    expect(computeWaterfallBackgroundDensity({ interactionStrength: 500 })).toBeCloseTo(0.01, 12)
  })

  it('saturates to the floor μ=1 at small g: n₀ = 1/g for g·0.01 < 1', () => {
    // g=50: max(0.5, 1) = 1  ⇒  n₀ = 1/50
    expect(computeWaterfallBackgroundDensity({ interactionStrength: 50 })).toBeCloseTo(1 / 50, 12)
  })

  it('returns 1.0 for non-positive g (safe fallback; builder branch is skipped anyway)', () => {
    expect(computeWaterfallBackgroundDensity({ interactionStrength: 0 })).toBe(1.0)
    expect(computeWaterfallBackgroundDensity({ interactionStrength: -10 })).toBe(1.0)
  })

  it('returns 1.0 for non-finite g', () => {
    expect(computeWaterfallBackgroundDensity({ interactionStrength: Number.NaN })).toBe(1.0)
    expect(
      computeWaterfallBackgroundDensity({ interactionStrength: Number.POSITIVE_INFINITY })
    ).toBe(1.0)
  })
})

describe('resolveBecMass', () => {
  it('returns the supplied mass when finite and positive', () => {
    expect(resolveBecMass({ mass: 2.5 })).toBe(2.5)
  })

  it('falls back to the TDSE default for null / undefined / non-positive / non-finite', () => {
    const fallback = DEFAULT_TDSE_CONFIG.mass
    expect(resolveBecMass({})).toBe(fallback)
    expect(resolveBecMass({ mass: null })).toBe(fallback)
    expect(resolveBecMass({ mass: 0 })).toBe(fallback)
    expect(resolveBecMass({ mass: -1 })).toBe(fallback)
    expect(resolveBecMass({ mass: Number.NaN })).toBe(fallback)
  })
})

describe('buildWaterfallParams', () => {
  it('composes the canonical BEC waterfall struct from the supplied fields', () => {
    const params = buildWaterfallParams({
      hawkingVmax: 3.5,
      hawkingLh: 0.6,
      hawkingDeltaN: 0.2,
      interactionStrength: 500,
      mass: 1.0,
      gridSize: [64, 32, 16],
      spacing: [0.15, 0.1, 0.2],
    })
    expect(params.vMax).toBe(3.5)
    expect(params.lh).toBe(0.6)
    expect(params.deltaN).toBe(0.2)
    expect(params.g).toBe(500)
    expect(params.mass).toBe(1.0)
    // lBox = gridSize[0] * spacing[0] = 64 * 0.15 = 9.6
    expect(params.lBox).toBeCloseTo(9.6, 12)
    // n₀ threads through computeWaterfallBackgroundDensity.
    expect(params.n0).toBeCloseTo(0.01, 12)
  })

  it('applies sensible defaults for every optional field', () => {
    const params = buildWaterfallParams({ gridSize: [64], spacing: [0.15] })
    expect(params.vMax).toBe(2.0)
    expect(params.lh).toBe(0.6)
    expect(params.deltaN).toBe(0)
    expect(params.g).toBe(500)
    expect(params.mass).toBe(1.0)
  })
})
