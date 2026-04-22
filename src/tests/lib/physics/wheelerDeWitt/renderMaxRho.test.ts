/**
 * `computeWdwRenderMaxRho` edge-case tests.
 *
 * The render-max cap sits between the physical solver output and the
 * density-grid packer. If it mishandles a degenerate solver output
 * (all-Euclidean, all-zero, etc.), the R channel saturation either
 * drops to DENSITY_MAX_FLOOR (crushing every cell to 1) or jumps to
 * the absurd 10³⁰ Airy-grown value (crushing every cell to near-zero).
 * Both failure modes look like "totally black scene" at render time
 * with no console diagnostic.
 */

import { describe, expect, it } from 'vitest'

import {
  clampWdwHeadroom,
  computeWdwRenderMaxRho,
  WDW_EUCLIDEAN_RENDER_HEADROOM,
  WDW_HEADROOM_MAX,
  WDW_HEADROOM_MIN,
} from '@/lib/physics/wheelerDeWitt/densityGrid'
import type { WheelerDeWittSolverOutput } from '@/lib/physics/wheelerDeWitt/solver'

function mockOutput(
  chiValues: number[][],
  lorentzianMask: number[],
  Na = 2,
  Nphi = 2
): WheelerDeWittSolverOutput {
  const slab = Nphi * Nphi
  const chi = new Float32Array(2 * Na * slab)
  for (let i = 0; i < chiValues.length; i++) {
    chi[2 * i] = chiValues[i]![0]!
    chi[2 * i + 1] = chiValues[i]![1]!
  }
  return {
    chi,
    lorentzianMask: new Uint8Array(lorentzianMask),
    bandKind: new Uint8Array(Na * slab),
    gridSize: [Na, Nphi, Nphi],
    aMin: 0.1,
    aMax: 1.5,
    phiExtent: 2,
    maxDensity:
      chi.length > 0
        ? Math.max(
            ...Array.from({ length: chi.length / 2 }, (_, i) => {
              const re = chi[2 * i]!
              const im = chi[2 * i + 1]!
              return re * re + im * im
            })
          )
        : 0,
    columnAiry: [],
  }
}

describe('computeWdwRenderMaxRho', () => {
  it('returns the floor when chi is identically zero (no mask coverage)', () => {
    const output = mockOutput([], [0, 0, 0, 0, 0, 0, 0, 0])
    const max = computeWdwRenderMaxRho(output)
    // Degenerate solver output: render-max falls back to the floor
    // so `rho / maxRho` is mathematically defined.
    expect(max).toBeGreaterThan(0)
    expect(max).toBeLessThan(1e-10) // the floor is 1e-20
  })

  it('returns the Lorentzian-only max × headroom when Euclidean blowup is present', () => {
    // χ = 1+0i (|χ|²=1) in Lorentzian cells, χ = 10000+0i (|χ|²=1e8)
    // in Euclidean cells. The render cap should be
    //   max(Lorentzian) · 100 = 100
    // which is FAR smaller than the global max 1e8, so the cap is
    // active.
    const chi = [
      [1, 0], // cell 0: Lorentzian
      [1, 0], // cell 1: Lorentzian
      [1, 0], // cell 2: Lorentzian
      [1, 0], // cell 3: Lorentzian
      [10000, 0], // cell 4: Euclidean
      [10000, 0], // cell 5: Euclidean
      [10000, 0], // cell 6: Euclidean
      [10000, 0], // cell 7: Euclidean
    ]
    const mask = [1, 1, 1, 1, 0, 0, 0, 0]
    const output = mockOutput(chi, mask)
    const max = computeWdwRenderMaxRho(output)
    expect(max).toBeCloseTo(100, 6) // 1 · 100 headroom = 100
  })

  it('returns the global max when Euclidean peak is below the headroom', () => {
    // Lorentzian max = 1, Euclidean max = 4 → headroom·Lorentzian = 100,
    // but globalMax = 4 < 100. The cap `min(capped, globalMax)` must
    // return globalMax = 4, not the impossibly-larger cap.
    const chi = [
      [1, 0],
      [1, 0],
      [1, 0],
      [1, 0], // Lor
      [2, 0],
      [2, 0],
      [2, 0],
      [2, 0], // Euc, rho = 4 each
    ]
    const mask = [1, 1, 1, 1, 0, 0, 0, 0]
    const output = mockOutput(chi, mask)
    const max = computeWdwRenderMaxRho(output)
    expect(max).toBeCloseTo(4, 6)
  })

  it('returns the global max when every cell is Lorentzian (no Euclidean blowup possible)', () => {
    const chi = [
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0], // |chi|^2 = 1, 4, 9, 16
      [1, 0],
      [1, 0],
      [1, 0],
      [1, 0],
    ]
    const mask = [1, 1, 1, 1, 1, 1, 1, 1]
    const output = mockOutput(chi, mask)
    const max = computeWdwRenderMaxRho(output)
    // globalMax = 16; Lorentzian × headroom = 16 · 100 = 1600; cap min = 16.
    expect(max).toBeCloseTo(16, 6)
  })

  it('honours a custom headroom multiplier passed explicitly', () => {
    // Same Euclidean-dominated fixture as above. With headroom=1 the cap
    // is the Lorentzian max (no headroom budget), with headroom=1000 the
    // cap rides up to 1000×Lorentzian (still clamped by globalMax=1e8).
    const chi = [
      [1, 0],
      [1, 0],
      [1, 0],
      [1, 0],
      [10000, 0],
      [10000, 0],
      [10000, 0],
      [10000, 0],
    ]
    const mask = [1, 1, 1, 1, 0, 0, 0, 0]
    const output = mockOutput(chi, mask)
    expect(computeWdwRenderMaxRho(output, 1)).toBeCloseTo(1, 6)
    expect(computeWdwRenderMaxRho(output, 1000)).toBeCloseTo(1000, 6)
    expect(computeWdwRenderMaxRho(output)).toBeCloseTo(WDW_EUCLIDEAN_RENDER_HEADROOM, 6)
  })

  it('clamps an out-of-range headroom before computing the cap', () => {
    const chi = [
      [1, 0],
      [1, 0],
      [1, 0],
      [1, 0],
      [10000, 0],
      [10000, 0],
      [10000, 0],
      [10000, 0],
    ]
    const mask = [1, 1, 1, 1, 0, 0, 0, 0]
    const output = mockOutput(chi, mask)
    // Below-floor headroom should behave like headroom=1 (min).
    expect(computeWdwRenderMaxRho(output, -5)).toBeCloseTo(WDW_HEADROOM_MIN, 6)
    // Above-ceiling headroom saturates at 10000·lorentzian=1e4; still
    // below globalMax=1e8 so no globalMax clamp kicks in.
    expect(computeWdwRenderMaxRho(output, 1e6)).toBeCloseTo(WDW_HEADROOM_MAX, 6)
    expect(computeWdwRenderMaxRho(output, Number.NaN)).toBeCloseTo(WDW_EUCLIDEAN_RENDER_HEADROOM, 6)
  })

  it('returns the global max when lorentzianMax is zero (fallback path)', () => {
    // Empty Lorentzian mask — all cells Euclidean — should still
    // produce a finite render cap via the globalMax fallback. This
    // keeps the packer functional even for a pathological all-Euclidean
    // solver output (e.g. if a future preset clips the grid so
    // aMin > a_turn everywhere).
    const chi = [
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
      [5, 0],
      [5, 0],
      [5, 0],
      [5, 0],
    ]
    const mask = [0, 0, 0, 0, 0, 0, 0, 0]
    const output = mockOutput(chi, mask)
    const max = computeWdwRenderMaxRho(output)
    // lorentzianMax = 0 (no Lor cells) → fallback to globalMax.
    // globalMax = 25. The result must be 25, not 0 or Infinity.
    expect(max).toBeCloseTo(25, 6)
  })
})

describe('clampWdwHeadroom', () => {
  it('clamps below-floor, above-ceiling, and non-finite values', () => {
    expect(clampWdwHeadroom(0.5)).toBe(WDW_HEADROOM_MIN)
    expect(clampWdwHeadroom(-5)).toBe(WDW_HEADROOM_MIN)
    expect(clampWdwHeadroom(10_000_000)).toBe(WDW_HEADROOM_MAX)
    // Non-finite values (NaN, ±Infinity) fall back to the default (100)
    // BEFORE the range clamp runs — an untyped URL param or bad store
    // write should not silently pin the slider to a boundary.
    expect(clampWdwHeadroom(Number.POSITIVE_INFINITY)).toBe(WDW_EUCLIDEAN_RENDER_HEADROOM)
    expect(clampWdwHeadroom(Number.NEGATIVE_INFINITY)).toBe(WDW_EUCLIDEAN_RENDER_HEADROOM)
    expect(clampWdwHeadroom(Number.NaN)).toBe(WDW_EUCLIDEAN_RENDER_HEADROOM)
    // In-range values pass through unchanged.
    expect(clampWdwHeadroom(1)).toBe(1)
    expect(clampWdwHeadroom(42.5)).toBe(42.5)
    expect(clampWdwHeadroom(WDW_HEADROOM_MAX)).toBe(WDW_HEADROOM_MAX)
  })
})
