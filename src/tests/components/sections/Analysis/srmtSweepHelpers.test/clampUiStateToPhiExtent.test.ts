import { describe, expect, it } from 'vitest'

import { clampUiStateToPhiExtent } from '@/components/sections/Analysis/srmtSweepHelpers'

// Regression: a φref window pushed past the top of the shrunk φ domain
// clamped both bounds onto +phiExtent — a zero-width sweep of N identical
// φref points.
describe('clampUiStateToPhiExtent φref span', () => {
  it('keeps the 0.05 span when both bounds exceed the new phiExtent', () => {
    const clamped = clampUiStateToPhiExtent(
      { kind: 'phiRef', points: 11, sweepMin: 1.6, sweepMax: 1.9, phiRef: 0, cutAnchor: 0.5 },
      1.0
    )
    expect(clamped.sweepMax).toBe(1)
    expect(clamped.sweepMax - clamped.sweepMin).toBeCloseTo(0.05, 12)
  })

  it('leaves an in-range φref window untouched', () => {
    const s = {
      kind: 'phiRef' as const,
      points: 11,
      sweepMin: -0.5,
      sweepMax: 0.5,
      phiRef: 0,
      cutAnchor: 0.5,
    }
    expect(clampUiStateToPhiExtent(s, 1.0)).toBe(s)
  })
})
