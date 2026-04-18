/**
 * Tests for the `computing` flag + setter added to the SRMT diagnostic
 * store when SRMT was offloaded to a Web Worker. Verifies:
 *
 *  - initial value is `false`,
 *  - `setSrmtComputing` toggles the flag and bumps the version counter,
 *  - `clear()` resets `computing` back to `false` along with the rest of
 *    the store.
 *
 * Scoped to the new flag because the original store behaviour is covered by
 * `srmtDiagnosticStore.test.ts`.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { useSrmtDiagnosticStore } from '@/stores/srmtDiagnosticStore'

describe('srmtDiagnosticStore.computing', () => {
  beforeEach(() => {
    useSrmtDiagnosticStore.getState().clear()
  })

  it('starts as false', () => {
    expect(useSrmtDiagnosticStore.getState().computing).toBe(false)
  })

  it('setSrmtComputing(true) flips the flag and bumps the version counter', () => {
    const v0 = useSrmtDiagnosticStore.getState().version
    useSrmtDiagnosticStore.getState().setSrmtComputing(true)
    const s = useSrmtDiagnosticStore.getState()
    expect(s.computing).toBe(true)
    expect(s.version).toBe(v0 + 1)
  })

  it('setSrmtComputing(false) clears the flag and bumps the version counter', () => {
    useSrmtDiagnosticStore.getState().setSrmtComputing(true)
    const v1 = useSrmtDiagnosticStore.getState().version
    useSrmtDiagnosticStore.getState().setSrmtComputing(false)
    const s = useSrmtDiagnosticStore.getState()
    expect(s.computing).toBe(false)
    expect(s.version).toBe(v1 + 1)
  })

  it('clear() resets computing back to false even when it was true', () => {
    useSrmtDiagnosticStore.getState().setSrmtComputing(true)
    expect(useSrmtDiagnosticStore.getState().computing).toBe(true)
    useSrmtDiagnosticStore.getState().clear()
    expect(useSrmtDiagnosticStore.getState().computing).toBe(false)
  })

  it('setSrmtComputing leaves snapshot + quality unchanged', () => {
    useSrmtDiagnosticStore.getState().setDiagnostic(
      {
        clock: 'a',
        slicePlane: 'phi-phi',
        cutIndex: 4,
        rankCap: 16,
        kSpectrum: Float32Array.from([0.1, 0.2]),
        hjSpectrum: Float32Array.from([0.3, 0.4, 0.5]),
        affineMatchQuality: 0.05,
        computeTimeMs: 10,
      },
      { a: 0.05, phi1: Number.NaN, phi2: Number.NaN }
    )
    const before = useSrmtDiagnosticStore.getState().snapshot
    if (before === null) throw new Error('expected snapshot populated')
    useSrmtDiagnosticStore.getState().setSrmtComputing(true)
    const after = useSrmtDiagnosticStore.getState().snapshot
    expect(after).toBe(before) // no reference-identity change on computing toggle
    expect(useSrmtDiagnosticStore.getState().clockAffineQuality.a).toBeCloseTo(0.05, 6)
  })
})
