/**
 * Tests for the pure {@link buildPageCurveSnapshot} helper extracted from
 * HawkingPageCurvePanel. Exercises the edge cases the panel used to
 * re-derive inline so a future refactor of the plot layout cannot silently
 * drift from the intended semantics.
 */

import { describe, expect, it } from 'vitest'

import { buildPageCurveSnapshot } from '@/components/overlays/pageCurve/snapshot'
import {
  createPageCurveBuffer,
  type PageCurveRingBuffer,
  pushPageCurveSample,
} from '@/lib/physics/bec/pageCurve'

function fillMonotonic(buf: PageCurveRingBuffer, count: number): void {
  for (let i = 0; i < count; i++) {
    pushPageCurveSample(buf, {
      t: i * 0.5,
      sTherm: i * 0.1,
      sPage: Math.min(i * 0.1, 1.0),
      islandRadius: i > 10 ? 0.5 : 0,
    })
  }
}

describe('buildPageCurveSnapshot', () => {
  it('returns hasData=false when the buffer has fewer than 2 samples', () => {
    const buf = createPageCurveBuffer(8)
    const snap = buildPageCurveSnapshot(buf, 0, 0.5, 0, () => null)
    expect(snap.hasData).toBe(false)
    expect(snap.thermPath).toBe('')
    expect(snap.pagePath).toBe('')

    pushPageCurveSample(buf, { t: 0, sTherm: 0, sPage: 0, islandRadius: 0 })
    const snap1 = buildPageCurveSnapshot(buf, 1, 0.5, 1, () => null)
    expect(snap1.hasData).toBe(false)
  })

  it('builds monotonic paths once ≥ 2 samples exist', () => {
    const buf = createPageCurveBuffer(16)
    fillMonotonic(buf, 8)
    const snap = buildPageCurveSnapshot(buf, 8, 0.5, 8, () => 3.5)
    expect(snap.hasData).toBe(true)
    expect(snap.tMin).toBe(0)
    expect(snap.tMax).toBe(3.5) // (8-1) * 0.5
    expect(snap.tPage).toBe(3.5)
    // Both paths must start with a MoveTo instruction.
    expect(snap.thermPath.startsWith('M ')).toBe(true)
    expect(snap.pagePath.startsWith('M ')).toBe(true)
    // And contain one LineTo for each additional sample.
    expect(snap.thermPath.split(' L ').length).toBe(8)
  })

  it('sMax floors at 1.2·sBH so S_BH stays visible even for tiny sTherm', () => {
    const buf = createPageCurveBuffer(8)
    pushPageCurveSample(buf, { t: 0, sTherm: 1e-6, sPage: 0, islandRadius: 0 })
    pushPageCurveSample(buf, { t: 1, sTherm: 2e-6, sPage: 0, islandRadius: 0 })
    const snap = buildPageCurveSnapshot(buf, 2, 10, 2, () => null)
    expect(snap.sMax).toBeGreaterThanOrEqual(12) // >= 1.2 * 10
  })

  it('passes bufferVersion through verbatim (memoization key contract)', () => {
    const buf = createPageCurveBuffer(4)
    const snap = buildPageCurveSnapshot(buf, 0, 0, 42, () => null)
    expect(snap.bufferVersion).toBe(42)
  })
})
