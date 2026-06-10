import { describe, expect, it } from 'vitest'

import {
  generateRiemannLut,
  gueWignerSurmise,
  hagedornPartitionGain,
  horizonRedshift,
  poissonSpacing,
  primePowersUpTo,
  RIEMANN_DEFAULT_RADIAL,
  RIEMANN_WORLD_SCALE,
  type RiemannRadialParams,
  riemannZetaBoundingRadius,
  sampleRiemannDensity,
  spacingFitError,
  spacingHistogram,
  truncatedZeta,
  unfoldedZeroSpacings,
} from '@/lib/physics/riemannZeta'

const LN = (x: number) => Math.log(x)

/** Build radial params for one source, using the default range. */
function params(source: 'zeros' | 'primes', beta = 1.4): RiemannRadialParams {
  return { ...RIEMANN_DEFAULT_RADIAL, source, beta }
}

/** Find the u of the maximum density inside [center−win, center+win]. */
function argmaxDensity(
  lut: Float32Array,
  p: RiemannRadialParams,
  center: number,
  win: number
): { u: number; value: number } {
  let bestU = center
  let best = -Infinity
  const steps = 80
  for (let i = 0; i <= steps; i++) {
    const u = center - win + (2 * win * i) / steps
    const v = sampleRiemannDensity(lut, p, u)
    if (v > best) {
      best = v
      bestU = u
    }
  }
  return { u: bestU, value: best }
}

describe('primePowersUpTo', () => {
  it('enumerates prime powers ≤ 16 sorted by log position', () => {
    const pps = primePowersUpTo(16)
    const values = pps.map((pp) => Math.round(pp.p ** pp.k))
    // 2,3,4(2²),5,7,8(2³),9(3²),11,13,16(2⁴)
    expect(values).toEqual([2, 3, 4, 5, 7, 8, 9, 11, 13, 16])
    // logPos is strictly increasing.
    for (let i = 1; i < pps.length; i++) {
      expect(pps[i]!.logPos).toBeGreaterThan(pps[i - 1]!.logPos)
    }
    // 4 = 2² ⇒ logPos = 2·ln2.
    const four = pps.find((pp) => pp.p === 2 && pp.k === 2)!
    expect(four.logPos).toBeCloseTo(2 * Math.LN2, 6)
  })
})

describe('explicit-formula reconstruction (zeros → primes)', () => {
  const p = params('zeros')
  const lut = generateRiemannLut(p)

  it.each([
    ['2', 2],
    ['3', 3],
    ['5', 5],
    ['7', 7],
  ])('density built from ζ zeros peaks at the prime r=%s', (_label, prime) => {
    // The local maximum inside a tight window around ln(prime) lands on ln(prime).
    const { u } = argmaxDensity(lut, p, LN(prime), 0.1)
    expect(u).toBeCloseTo(LN(prime), 1) // within ±0.05
    expect(Math.abs(u - LN(prime))).toBeLessThan(0.06)
  })

  it('localises strongly at prime powers vs. the gaps between them', () => {
    const positions = primePowersUpTo(13)
      .map((pp) => pp.logPos)
      .filter((u) => u > p.uMin + 0.1 && u < p.uMax - 0.1)
    const meanAtPrimes =
      positions.reduce((s, u) => s + sampleRiemannDensity(lut, p, u), 0) / positions.length
    // Sample the troughs: shift each prime position by +0.22 (a non-prime-power u).
    const gaps = positions
      .map((u) => u + 0.22)
      .filter((u) => positions.every((pu) => Math.abs(pu - u) > 0.1) && u < p.uMax - 0.05)
    const meanAtGaps = gaps.reduce((s, u) => s + sampleRiemannDensity(lut, p, u), 0) / gaps.length
    expect(meanAtPrimes).toBeGreaterThan(3 * meanAtGaps)
  })
})

describe('prime ⇄ zero duality', () => {
  it('zeros-built and primes-built shells sit at the same prime radii', () => {
    const pz = params('zeros')
    const pp = params('primes', 1.01)
    const lutZeros = generateRiemannLut(pz)
    const lutPrimes = generateRiemannLut(pp)
    for (const prime of [2, 3, 5, 7]) {
      const z = argmaxDensity(lutZeros, pz, LN(prime), 0.1)
      const r = argmaxDensity(lutPrimes, pp, LN(prime), 0.1)
      // Both constructions peak at the same place (the prime), within ±0.06.
      expect(Math.abs(z.u - r.u)).toBeLessThan(0.06)
      expect(Math.abs(z.u - LN(prime))).toBeLessThan(0.06)
    }
  })
})

describe('Hagedorn temperature (primon-gas partition function)', () => {
  it('truncated ζ(β) decreases monotonically in β', () => {
    expect(truncatedZeta(1.05)).toBeGreaterThan(truncatedZeta(1.5))
    expect(truncatedZeta(1.5)).toBeGreaterThan(truncatedZeta(2.5))
  })

  it('diverges as β → 1⁺ (Hagedorn point)', () => {
    expect(truncatedZeta(1.001)).toBeGreaterThan(truncatedZeta(1.1))
    expect(truncatedZeta(1.001)).toBeGreaterThan(5)
  })

  it('emission gain ignites near β=1 and dims for a cold gas', () => {
    expect(hagedornPartitionGain(1.02)).toBeGreaterThan(1)
    expect(hagedornPartitionGain(1.02)).toBeGreaterThan(hagedornPartitionGain(1.4))
    expect(hagedornPartitionGain(2.5)).toBeLessThan(1)
  })
})

describe('Montgomery–Odlyzko GUE statistics', () => {
  const spacings = unfoldedZeroSpacings()

  it('unfolded zero spacings have mean ≈ 1', () => {
    const mean = spacings.reduce((s, x) => s + x, 0) / spacings.length
    expect(mean).toBeGreaterThan(0.85)
    expect(mean).toBeLessThan(1.15)
  })

  it('the zeros follow GUE (level repulsion), not Poisson', () => {
    const hist = spacingHistogram(spacings, 0.25, 4)
    const gueErr = spacingFitError(hist, gueWignerSurmise)
    const poissonErr = spacingFitError(hist, poissonSpacing)
    expect(gueErr).toBeLessThan(poissonErr)
  })

  it('GUE surmise vanishes at s=0 (repulsion) while Poisson does not', () => {
    expect(gueWignerSurmise(0)).toBeCloseTo(0, 6)
    expect(poissonSpacing(0)).toBeCloseTo(1, 6)
  })
})

describe('Berry–Keating horizon redshift', () => {
  it('is unity with no horizon and zero inside the horizon', () => {
    expect(horizonRedshift(3, 0, 3)).toBe(1)
    expect(horizonRedshift(0.5, 1, 3)).toBe(0)
    expect(horizonRedshift(1, 1, 3)).toBe(0)
  })

  it('rises from 0 toward 1 with radius above r_h, and depends on dimension', () => {
    const r3 = horizonRedshift(2, 1, 3)
    expect(r3).toBeGreaterThan(0)
    expect(r3).toBeLessThan(1)
    // Higher dimension ⇒ steeper Tangherlini falloff ⇒ less suppression at a fixed r/r_h.
    expect(horizonRedshift(2, 1, 6)).toBeGreaterThan(r3)
  })
})

describe('bounding radius', () => {
  it('contains the largest world-space shell but stays capped for performance', () => {
    const r = riemannZetaBoundingRadius(undefined, 3)
    const largestShell = Math.exp(RIEMANN_DEFAULT_RADIAL.uMax) * RIEMANN_WORLD_SCALE
    expect(r).toBeGreaterThan(largestShell)
    expect(r).toBeLessThanOrEqual(14)
  })
})
