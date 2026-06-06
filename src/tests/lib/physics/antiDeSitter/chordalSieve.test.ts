/**
 * Round 8 AdS Chordal Sieve CPU-mirror tests.
 *
 * These tests assert numerical behavior of the horosphere clocks and scalar
 * sieve, not symbol existence or default wiring.
 */

import { describe, expect, it } from 'vitest'

import {
  boundaryAnchorForAds,
  busemannClock,
  type ChordalSievePoint,
  computeAdsChordalSieveScalar,
} from '@/lib/physics/antiDeSitter/chordalSieve'

const TWO_PI_OVER_THREE = (2 * Math.PI) / 3

function scaled(point: ChordalSievePoint, scale: number): ChordalSievePoint {
  return {
    x: point.x * scale,
    y: point.y * scale,
    z: point.z * scale,
  }
}

function clockDifference(point: ChordalSievePoint, m: number): number {
  return (
    busemannClock(point, boundaryAnchorForAds(m)) -
    busemannClock(point, boundaryAnchorForAds(m, TWO_PI_OVER_THREE, -0.25))
  )
}

describe('busemannClock', () => {
  it('is finite inside the ball and grows near the chosen boundary anchor', () => {
    const anchor = boundaryAnchorForAds(0.7)
    const center = { x: 0, y: 0, z: 0 }
    const nearAnchor = scaled(anchor, 0.995)

    const centerClock = busemannClock(center, anchor)
    const nearClock = busemannClock(nearAnchor, anchor)

    expect(Number.isFinite(centerClock)).toBe(true)
    expect(Number.isFinite(nearClock)).toBe(true)
    expect(nearClock).toBeGreaterThan(centerClock + 4)
  })

  it('changes the A-B Busemann difference when m rotates the anchor pair', () => {
    const point = { x: 0.24, y: -0.18, z: 0.27 }

    const diffA = clockDifference(point, 0.1)
    const diffB = clockDifference(point, 1.4)

    expect(Math.abs(diffA - diffB)).toBeGreaterThan(0.25)
  })
})

describe('computeAdsChordalSieveScalar', () => {
  const base = {
    point: { x: 0.31, y: -0.22, z: 0.18 },
    densityNorm: 0.85,
    n: 2,
    l: 1,
    m: 0.45,
    frequency: 1.25,
    twist: 0.35,
  }

  it('returns zero outside the ball and at zero density', () => {
    expect(
      computeAdsChordalSieveScalar({
        ...base,
        point: { x: 1.01, y: 0, z: 0 },
      })
    ).toBe(0)

    expect(
      computeAdsChordalSieveScalar({
        ...base,
        densityNorm: 0,
      })
    ).toBe(0)
  })

  it('stays bounded in [0, 1] across representative bulk points and controls', () => {
    const points: ChordalSievePoint[] = [
      { x: 0, y: 0, z: 0 },
      { x: 0.2, y: 0.1, z: -0.35 },
      { x: -0.42, y: 0.33, z: 0.18 },
      { x: 0.57, y: -0.16, z: 0.24 },
      scaled(boundaryAnchorForAds(0.9), 0.94),
    ]
    const controls = [
      { densityNorm: 0.25, n: 0, l: 0, m: 0, frequency: 0, twist: 0 },
      { densityNorm: 1, n: 1, l: 2, m: 0.7, frequency: 2.5, twist: -0.8 },
      { densityNorm: 3, n: 4, l: -3, m: -1.2, frequency: 9, twist: 1.7 },
    ]

    for (const point of points) {
      for (const control of controls) {
        const scalar = computeAdsChordalSieveScalar({ point, ...control })
        expect(Number.isFinite(scalar)).toBe(true)
        expect(scalar).toBeGreaterThanOrEqual(0)
        expect(scalar).toBeLessThanOrEqual(1)
      }
    }
  })

  it('higher frequency changes phase contrast at the same point', () => {
    const lowFrequency = computeAdsChordalSieveScalar({
      ...base,
      frequency: 0.4,
      twist: 0.2,
    })
    const highFrequency = computeAdsChordalSieveScalar({
      ...base,
      frequency: 5.3,
      twist: 0.2,
    })

    expect(Math.abs(highFrequency - lowFrequency)).toBeGreaterThan(0.02)
  })

  it('twist changes phase contrast at the same point', () => {
    const untwisted = computeAdsChordalSieveScalar({
      ...base,
      frequency: 1.1,
      twist: 0,
    })
    const twisted = computeAdsChordalSieveScalar({
      ...base,
      frequency: 1.1,
      twist: 1.35,
    })

    expect(Math.abs(twisted - untwisted)).toBeGreaterThan(0.02)
  })
})
