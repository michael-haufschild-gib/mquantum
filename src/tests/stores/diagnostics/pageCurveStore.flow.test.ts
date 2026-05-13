/**
 * End-to-end push/snapshot flow tests for `pageCurveStore`.
 *
 * Verifies the integrator + ring buffer + version-counter contract that the
 * HUD overlay relies on:
 *   - Every `pushSample` increments the version counter exactly once.
 *   - Every `pushSample` increments `buffer.count` until the capacity is hit.
 *   - `S_therm(t)` is monotone non-decreasing for any non-negative rate.
 *   - `S_page(t) = min(S_therm, S_BH)` is bounded by `S_BH` once that
 *     becomes the smaller of the two.
 *
 * @module tests/stores/pageCurveStore.flow
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getPageCurveSample } from '@/lib/physics/bec/pageCurve'
import { usePageCurveStore } from '@/stores/diagnostics/pageCurveStore'

function resetStore(): void {
  usePageCurveStore.setState(usePageCurveStore.getInitialState())
  usePageCurveStore.getState().clear()
}

describe('pageCurveStore — push flow + snapshot integrity', () => {
  beforeEach(resetStore)
  afterEach(resetStore)

  it('100 sequential pushes bump version and count, sTherm grows monotonically, sPage ≤ sBH', () => {
    const store = usePageCurveStore.getState()
    const versionBefore = store.version
    const countBefore = store.buffer.count
    expect(countBefore).toBe(0)

    const baseT = 0
    const dt = 0.05
    // Constant horizon area + slowly increasing tH so the rate grows monotonically.
    const areaH = 50
    const cs0 = 2.0
    let prevSTherm = 0
    let lastSBH = 0

    for (let i = 1; i <= 100; i++) {
      const t = baseT + i * dt
      const tH = 0.1 + i * 0.001 // strictly positive
      usePageCurveStore.getState().pushSample({
        t,
        tH,
        areaH,
        cs0,
        supersonicExtent: 1.0,
      })
      const s = usePageCurveStore.getState()
      expect(s.version).toBe(versionBefore + i)
      const expectedCount = Math.min(s.buffer.capacity, i)
      expect(s.buffer.count).toBe(expectedCount)
      // Monotone non-decreasing accumulator.
      expect(s.lastSTherm).toBeGreaterThanOrEqual(prevSTherm)
      prevSTherm = s.lastSTherm
      lastSBH = s.lastSBH
    }

    // S_BH constant (areaH and gEff didn't change).
    expect(lastSBH).toBeGreaterThan(0)

    // Final samples in the buffer must observe S_page ≤ S_BH.
    const buf = usePageCurveStore.getState().buffer
    const lastIdx = buf.count - 1
    const last = getPageCurveSample(buf, lastIdx)
    if (!last) throw new Error('expected last sample to exist')
    expect(last.sPage).toBeLessThanOrEqual(lastSBH + 1e-12)
  })

  it('clear() resets count, version bumps, and integrator forgets prior dt', () => {
    usePageCurveStore.getState().pushSample({
      t: 0.1,
      tH: 0.5,
      areaH: 10,
      cs0: 1.5,
      supersonicExtent: 1.0,
    })
    usePageCurveStore.getState().pushSample({
      t: 0.2,
      tH: 0.5,
      areaH: 10,
      cs0: 1.5,
      supersonicExtent: 1.0,
    })
    const beforeClear = usePageCurveStore.getState()
    const versionBeforeClear = beforeClear.version
    expect(beforeClear.lastSTherm).toBeGreaterThan(0)

    usePageCurveStore.getState().clear()
    const afterClear = usePageCurveStore.getState()
    expect(afterClear.buffer.count).toBe(0)
    expect(afterClear.lastSTherm).toBe(0)
    expect(afterClear.version).toBeGreaterThan(versionBeforeClear)

    // Prove the integrator actually forgot the prior timestamp: push a
    // fresh sample into the cleared store and compare its lastSTherm to
    // the same push into a pristine store. A stale `lastT`/`lastSTherm`
    // carry-over would accumulate from the pre-clear sample and diverge.
    const sample = {
      t: 0.3,
      tH: 0.5,
      areaH: 10,
      cs0: 1.5,
      supersonicExtent: 1.0,
    }
    usePageCurveStore.getState().pushSample(sample)
    const afterClearPush = usePageCurveStore.getState().lastSTherm

    resetStore()
    usePageCurveStore.getState().pushSample(sample)
    expect(usePageCurveStore.getState().lastSTherm).toBe(afterClearPush)
  })
})
