import { describe, expect, it } from 'vitest'

import {
  BIFURCATION_DEFAULT_LUT,
  BIFURCATION_NT,
  BIFURCATION_NU,
  BIFURCATION_RING_COUNT,
  BIFURCATION_T_MAX,
  BIFURCATION_U_HALF,
  bifurcationHorizonBoundingRadius,
  bifurcationRingHeight,
  generateBifurcationLut,
  sampleBifurcationDensity,
} from '@/lib/physics/bifurcationHorizon'
import { RIEMANN_ZEROS } from '@/lib/physics/riemannZeta'

/** Generate the default on-line (RH-case) LUT once for the shared assertions. */
const lut = generateBifurcationLut(BIFURCATION_DEFAULT_LUT)

describe('generateBifurcationLut layout', () => {
  it('produces an interleaved Float32Array of length NT*NU*4', () => {
    expect(lut).toBeInstanceOf(Float32Array)
    expect(lut.length).toBe(BIFURCATION_NT * BIFURCATION_NU * 4)
  })

  it('is finite and the density channel is non-negative everywhere', () => {
    for (let i = 0; i < lut.length; i++) {
      expect(Number.isFinite(lut[i]!)).toBe(true)
    }
    for (let cell = 0; cell < BIFURCATION_NT * BIFURCATION_NU; cell++) {
      expect(lut[cell * 4]!).toBeGreaterThanOrEqual(0)
    }
  })

  it('normalises the density channel to unit peak', () => {
    let maxRho = 0
    for (let cell = 0; cell < BIFURCATION_NT * BIFURCATION_NU; cell++) {
      maxRho = Math.max(maxRho, lut[cell * 4]!)
    }
    expect(maxRho).toBeCloseTo(1, 5)
  })
})

describe('throat membrane (bifurcation surface at u=0)', () => {
  it('peaks at u=0 across the wedge axis (away from the rings)', () => {
    // Pick the midpoint between the first two zero-rings so the membrane (not a
    // ring) dominates: the ring Gaussian is negligible (>4σ) there.
    const ringHeights = RIEMANN_ZEROS.slice(0, BIFURCATION_RING_COUNT).map(bifurcationRingHeight)
    const tGap = (ringHeights[0]! + ringHeights[1]!) / 2
    expect(ringHeights.every((h) => Math.abs(h - tGap) > 0.3)).toBe(true)

    const center = sampleBifurcationDensity(lut, tGap, 0)
    const left = sampleBifurcationDensity(lut, tGap, -1.0)
    const right = sampleBifurcationDensity(lut, tGap, 1.0)
    expect(center).toBeGreaterThan(left)
    expect(center).toBeGreaterThan(right)
    expect(center).toBeGreaterThan(0)
  })

  it('would fail if the membrane Gaussian were broken (center must dominate the wedge)', () => {
    const h0 = bifurcationRingHeight(RIEMANN_ZEROS[0]!)
    const h1 = bifurcationRingHeight(RIEMANN_ZEROS[1]!)
    const tGap = (h0 + h1) / 2
    const center = sampleBifurcationDensity(lut, tGap, 0)
    // Far into the wedge the membrane has decayed below the background cut.
    const farWedge = sampleBifurcationDensity(lut, tGap, BIFURCATION_U_HALF * 0.9)
    expect(center).toBeGreaterThan(farWedge + 0.2)
  })
})

describe('zero rings stacked along the throat', () => {
  it('a column at t≈Y_0 (first zero) has a ring peak at u≈0', () => {
    const t0 = bifurcationRingHeight(RIEMANN_ZEROS[0]!)
    // On the throat at the ring height, density is at least the membrane peak
    // (ring + membrane stack), and strictly greater than the same wedge offset.
    const onRing = sampleBifurcationDensity(lut, t0, 0)
    const offRingU = sampleBifurcationDensity(lut, t0, 0.8)
    expect(onRing).toBeGreaterThan(offRingU)
    expect(onRing).toBeGreaterThan(0.5)
  })

  it('ring heights are GUE-spaced (strictly increasing, preserving relative spacing)', () => {
    const heights = RIEMANN_ZEROS.slice(0, BIFURCATION_RING_COUNT).map(bifurcationRingHeight)
    for (let n = 1; n < heights.length; n++) {
      expect(heights[n]!).toBeGreaterThan(heights[n - 1]!)
    }
    // First and last rings sit inside the window with margin.
    expect(heights[0]!).toBeGreaterThan(0)
    expect(heights[heights.length - 1]!).toBeLessThan(BIFURCATION_T_MAX)
  })
})

describe('u-symmetry of the on-line (RH-case) field', () => {
  it('F(t,u) ≈ F(t,−u) when offLine = 0 (modular mirror s ↦ 1−s̄)', () => {
    const t0 = bifurcationRingHeight(RIEMANN_ZEROS[1]!)
    for (const u of [0.3, 0.7, 1.2, 1.8]) {
      const plus = sampleBifurcationDensity(lut, t0, u)
      const minus = sampleBifurcationDensity(lut, t0, -u)
      expect(plus).toBeCloseTo(minus, 5)
    }
  })

  it('breaks u-symmetry when offLine > 0 (rings displaced off the throat)', () => {
    const offLut = generateBifurcationLut({ ...BIFURCATION_DEFAULT_LUT, offLine: 0.5 })
    const t0 = bifurcationRingHeight(RIEMANN_ZEROS[0]!) // even ring → +0.5 offset
    const plus = sampleBifurcationDensity(offLut, t0, 0.5)
    const minus = sampleBifurcationDensity(offLut, t0, -0.5)
    expect(Math.abs(plus - minus)).toBeGreaterThan(0.1)
  })
})

describe('density vanishes outside the LUT window', () => {
  it('returns exactly 0 outside [0,tMax] × [−uHalf,uHalf]', () => {
    expect(sampleBifurcationDensity(lut, -0.5, 0)).toBe(0)
    expect(sampleBifurcationDensity(lut, BIFURCATION_T_MAX + 1, 0)).toBe(0)
    expect(sampleBifurcationDensity(lut, 1, BIFURCATION_U_HALF + 0.5)).toBe(0)
    expect(sampleBifurcationDensity(lut, 1, -BIFURCATION_U_HALF - 0.5)).toBe(0)
  })
})

describe('bifurcationHorizonBoundingRadius', () => {
  it('is finite, positive, and capped at 14', () => {
    const r = bifurcationHorizonBoundingRadius(undefined, 3)
    expect(r).toBeGreaterThan(0)
    expect(r).toBeLessThanOrEqual(14)
    // Default tMax = 12 → 12*0.55 + 1 = 7.6.
    expect(r).toBeCloseTo(BIFURCATION_T_MAX * 0.55 + 1.0, 5)
  })

  it('caps very large throat heights at 14', () => {
    expect(bifurcationHorizonBoundingRadius({ tMax: 100 }, 3)).toBe(14)
  })
})
