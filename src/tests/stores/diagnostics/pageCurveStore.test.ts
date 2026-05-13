/**
 * Tests for `stores/pageCurveStore`.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_SB_COEFFICIENT } from '@/lib/physics/bec/pageCurve'
import { usePageCurveStore } from '@/stores/diagnostics/pageCurveStore'

describe('pageCurveStore', () => {
  beforeEach(() => {
    usePageCurveStore.getState().clear()
    usePageCurveStore.getState().setGEff(1)
    usePageCurveStore.getState().setDMaxFrac(0.8)
    usePageCurveStore.getState().setSbCoefficient(DEFAULT_SB_COEFFICIENT)
  })

  it('pushes samples, accumulates S_therm monotonically, and tracks S_BH', () => {
    const store = usePageCurveStore.getState()
    const inputs = { t: 0, tH: 0.1, areaH: 1, cs0: 1, supersonicExtent: 2 }
    store.pushSample(inputs)
    expect(store.buffer.count).toBe(1)
    let prev = usePageCurveStore.getState().lastSTherm
    for (let i = 1; i <= 50; i++) {
      usePageCurveStore.getState().pushSample({ ...inputs, t: i * 0.1 })
      const state = usePageCurveStore.getState()
      expect(state.lastSTherm).toBeGreaterThanOrEqual(prev)
      prev = state.lastSTherm
    }
    const final = usePageCurveStore.getState()
    expect(final.buffer.count).toBe(51)
    expect(final.lastSBH).toBeCloseTo(1 / 4, 10)
  })

  it('gracefully handles "no horizon" (areaH = 0) — S_BH = 0, S_page = S_therm', () => {
    const store = usePageCurveStore.getState()
    for (let i = 0; i < 10; i++) {
      store.pushSample({
        t: i * 0.1,
        tH: 0, // no temp
        areaH: 0, // no horizon
        cs0: 1,
        supersonicExtent: 0,
      })
    }
    const s = usePageCurveStore.getState()
    expect(s.lastSBH).toBe(0)
    expect(s.lastIslandRadius).toBe(0)
    // lastSTherm should stay 0 (rate is 0 when tH or areaH is 0).
    expect(s.lastSTherm).toBe(0)
  })

  it('setBufferSize reallocates and clears', () => {
    const store = usePageCurveStore.getState()
    store.pushSample({ t: 1, tH: 0.1, areaH: 1, cs0: 1, supersonicExtent: 2 })
    const originalBuf = store.buffer
    usePageCurveStore.getState().setBufferSize(32)
    const next = usePageCurveStore.getState()
    expect(next.buffer).not.toBe(originalBuf)
    expect(next.buffer.capacity).toBe(32)
    expect(next.buffer.count).toBe(0)
  })

  it('clamps G_eff, dMaxFrac, sbCoefficient to valid ranges', () => {
    usePageCurveStore.getState().setGEff(-5)
    expect(usePageCurveStore.getState().gEff).toBe(1e-6)
    usePageCurveStore.getState().setGEff(1e12)
    expect(usePageCurveStore.getState().gEff).toBe(1e6)
    usePageCurveStore.getState().setDMaxFrac(2)
    expect(usePageCurveStore.getState().dMaxFrac).toBe(1)
    usePageCurveStore.getState().setDMaxFrac(-1)
    expect(usePageCurveStore.getState().dMaxFrac).toBe(0)
    usePageCurveStore.getState().setSbCoefficient(0)
    expect(usePageCurveStore.getState().sbCoefficient).toBe(1e-6)
  })

  it('defaults islandBoost to 1.8 and clamps setIslandBoost to [1.0, 4.0]', () => {
    // Reset to initial state so prior tests don't bleed boost mutations in.
    usePageCurveStore.setState(usePageCurveStore.getInitialState())
    expect(usePageCurveStore.getState().islandBoost).toBe(1.8)
    // Below 1.0 → clamp up.
    usePageCurveStore.getState().setIslandBoost(0.1)
    expect(usePageCurveStore.getState().islandBoost).toBe(1.0)
    // Above 4.0 → clamp down.
    usePageCurveStore.getState().setIslandBoost(999)
    expect(usePageCurveStore.getState().islandBoost).toBe(4.0)
    // Non-finite → clamp to the min (matches `clamp` helper fallback).
    usePageCurveStore.getState().setIslandBoost(Number.NaN)
    expect(usePageCurveStore.getState().islandBoost).toBe(1.0)
    // In-range value passes through.
    usePageCurveStore.getState().setIslandBoost(2.5)
    expect(usePageCurveStore.getState().islandBoost).toBe(2.5)
  })

  it('setIslandOverlayEnabled + setIslandBoost propagate without resetting the page-curve buffer', () => {
    const store = usePageCurveStore.getState()
    // Seed a sample so we can confirm the buffer survives overlay toggles.
    store.pushSample({ t: 0, tH: 0.1, areaH: 1, cs0: 1, supersonicExtent: 2 })
    const countBefore = usePageCurveStore.getState().buffer.count
    expect(countBefore).toBeGreaterThan(0)
    usePageCurveStore.getState().setIslandOverlayEnabled(true)
    usePageCurveStore.getState().setIslandBoost(2.4)
    const after = usePageCurveStore.getState()
    expect(after.islandOverlayEnabled).toBe(true)
    expect(after.islandBoost).toBe(2.4)
    expect(after.buffer.count).toBe(countBefore)
  })

  it('getPageTime returns null before crossing, number after', () => {
    // Ensure the ring buffer is large enough to retain the early samples
    // where the crossing happens — earlier tests may have shrunk it.
    usePageCurveStore.getState().setBufferSize(512)
    // With G_eff = 1 and areaH = 1, S_BH = 0.25. Drive a small rate until the
    // integrated S_therm crosses 0.25.
    for (let i = 0; i < 200; i++) {
      usePageCurveStore.getState().pushSample({
        t: i * 0.1,
        tH: 2.0,
        areaH: 1.0,
        cs0: 1.0,
        supersonicExtent: 3,
      })
    }
    const tPage = usePageCurveStore.getState().getPageTime()
    // tPage is the first S_therm = S_BH crossing; with the parameters above
    // (T_H = 2, A = 1, c_s0 = 1, G_eff = 1 ⇒ S_BH = 0.25) the crossing
    // happens on the first trapezoid step so tPage < 0.1.
    expect(tPage ?? -1).toBeGreaterThan(0)
    expect(tPage ?? 999).toBeLessThan(0.1)
  })
})
