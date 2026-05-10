import { describe, expect, it } from 'vitest'

import { writePerClockFit } from '@/lib/physics/srmt/sweepPoint'
import type { SrmtSweepPoint } from '@/lib/physics/srmt/sweepTypes'

function blankPoint(): SrmtSweepPoint {
  return {
    index: 0,
    sweepValue: 0.5,
    cutNormalized: 0.5,
    quality: {},
    qStdev: {},
    qRigid: {},
    qRigidStdev: {},
    alphaByClock: {},
    betaByClock: {},
    rEffByClock: {},
    floorFractionByClock: {},
    kSpectrumByClock: {},
    hjSpectrumByClock: {},
    computeMs: 0,
  }
}

describe('writePerClockFit', () => {
  it('writes affine, rigid, jackknife, and full-spectrum diagnostics for one clock', () => {
    const point = blankPoint()
    const E = new Float64Array([1, 2, 4, 7])
    const K = new Float64Array([5, 7, 11, 17])
    const schmidtFull = new Float64Array([1, 0.1, 0.01, 0.0011, 0.001, 0.0009])

    writePerClockFit(point, 'a', K, E, 4, schmidtFull, Math.exp(-20))

    expect(point.quality.a).toBeCloseTo(0, 14)
    expect(point.alphaByClock!.a).toBeCloseTo(2, 14)
    expect(point.betaByClock!.a).toBeCloseTo(3, 14)
    expect(point.qStdev!.a).toBeCloseTo(0, 14)
    expect(point.qRigid!.a).toBeGreaterThan(point.quality.a!)
    expect(point.qRigidStdev!.a).toBeGreaterThanOrEqual(0)
    expect(point.rEffByClock!.a).toBe(4)
    expect(point.floorFractionByClock!.a).toBe(0)
  })

  it('computes floor fraction over the fitted compare window, not the full K buffer', () => {
    const point = blankPoint()
    const floor = 10
    const epsilon = Math.exp(-floor)
    const K = new Float64Array([10, 9, 5, 10, 10])
    const E = new Float64Array([1, 2, 3, 4, 5])
    const schmidtFull = new Float64Array([1, 0.1, 0.01])

    writePerClockFit(point, 'phi1', K, E, 3, schmidtFull, epsilon)

    expect(point.floorFractionByClock!.phi1).toBeCloseTo(2 / 3, 14)
  })

  it('does not publish affine parameters or stdevs when the fit is degenerate', () => {
    const point = blankPoint()
    const K = new Float64Array([3, 4, 5])
    const zeroVarianceE = new Float64Array([2, 2, 2])
    const schmidtFull = new Float64Array([1, 0])

    writePerClockFit(point, 'phi2', K, zeroVarianceE, 3, schmidtFull, Math.exp(-12))

    expect(point.quality.phi2).toBeNaN()
    expect(point.alphaByClock!.phi2).toBeUndefined()
    expect(point.betaByClock!.phi2).toBeUndefined()
    expect(point.qStdev!.phi2).toBeUndefined()
    expect(point.qRigid!.phi2).toBeGreaterThanOrEqual(0)
    expect(point.qRigidStdev!.phi2).toBeGreaterThanOrEqual(0)
    expect(point.rEffByClock!.phi2).toBe(1)
  })
})
