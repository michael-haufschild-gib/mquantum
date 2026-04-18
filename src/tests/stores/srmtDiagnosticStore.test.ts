/**
 * Tests for the SRMT diagnostic Zustand store. Focus: setters update
 * state + bump the version counter; clear() resets everything; the
 * "pending" quality record is all NaN.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import {
  createPendingClockQuality,
  type SrmtSnapshot,
  useSrmtDiagnosticStore,
} from '@/stores/srmtDiagnosticStore'

function makeSnapshot(): SrmtSnapshot {
  return {
    clock: 'a',
    slicePlane: 'phi-phi',
    cutIndex: 8,
    rankCap: 32,
    kSpectrum: Float32Array.from([0.1, 0.2, 0.3]),
    hjSpectrum: Float32Array.from([0.5, 0.6, 0.7, 0.8]),
    affineMatchQuality: 0.123,
    computeTimeMs: 42,
  }
}

describe('srmtDiagnosticStore', () => {
  beforeEach(() => {
    useSrmtDiagnosticStore.getState().clear()
  })

  it('starts in the initial pending state', () => {
    useSrmtDiagnosticStore.getState().clear()
    const s = useSrmtDiagnosticStore.getState()
    expect(s.snapshot).toBeNull()
    expect(Number.isNaN(s.clockAffineQuality.a)).toBe(true)
    expect(Number.isNaN(s.clockAffineQuality.phi1)).toBe(true)
    expect(Number.isNaN(s.clockAffineQuality.phi2)).toBe(true)
  })

  it('setDiagnostic writes the snapshot, quality record, and bumps version', () => {
    const v0 = useSrmtDiagnosticStore.getState().version
    const snap = makeSnapshot()
    const quality = { a: 0.123, phi1: Number.NaN, phi2: Number.NaN }

    useSrmtDiagnosticStore.getState().setDiagnostic(snap, quality)

    const s = useSrmtDiagnosticStore.getState()
    const snapshot = s.snapshot
    if (snapshot === null) throw new Error('expected snapshot to be populated')
    expect(snapshot.clock).toBe('a')
    expect(snapshot.affineMatchQuality).toBeCloseTo(0.123, 6)
    expect(snapshot.kSpectrum.length).toBe(3)
    expect(snapshot.hjSpectrum.length).toBe(4)
    expect(s.clockAffineQuality.a).toBeCloseTo(0.123, 6)
    expect(Number.isNaN(s.clockAffineQuality.phi1)).toBe(true)
    expect(s.version).toBe(v0 + 1)
  })

  it('setDiagnostic copies the quality record so later callers cannot mutate store state', () => {
    const snap = makeSnapshot()
    const quality = { a: 0.5, phi1: 1.0, phi2: 2.0 }
    useSrmtDiagnosticStore.getState().setDiagnostic(snap, quality)
    quality.a = 999
    const s = useSrmtDiagnosticStore.getState()
    expect(s.clockAffineQuality.a).toBeCloseTo(0.5, 6)
  })

  it('clear resets snapshot + quality + bumps version', () => {
    useSrmtDiagnosticStore.getState().setDiagnostic(makeSnapshot(), {
      a: 0.2,
      phi1: 0.4,
      phi2: 0.8,
    })
    const vBefore = useSrmtDiagnosticStore.getState().version
    useSrmtDiagnosticStore.getState().clear()
    const s = useSrmtDiagnosticStore.getState()
    expect(s.snapshot).toBeNull()
    expect(Number.isNaN(s.clockAffineQuality.a)).toBe(true)
    expect(Number.isNaN(s.clockAffineQuality.phi1)).toBe(true)
    expect(s.version).toBe(vBefore + 1)
  })

  it('createPendingClockQuality returns fresh NaN records (no shared mutable state)', () => {
    const a = createPendingClockQuality()
    const b = createPendingClockQuality()
    a.a = 0.5
    expect(Number.isNaN(b.a)).toBe(true)
  })

  it('setClockQuality merges a single clock entry + bumps version', () => {
    useSrmtDiagnosticStore.getState().setDiagnostic(makeSnapshot(), {
      a: 0.05,
      phi1: Number.NaN,
      phi2: Number.NaN,
    })
    const v0 = useSrmtDiagnosticStore.getState().version
    useSrmtDiagnosticStore.getState().setClockQuality('phi1', 0.17)
    const s = useSrmtDiagnosticStore.getState()
    expect(s.clockAffineQuality.a).toBeCloseTo(0.05, 6)
    expect(s.clockAffineQuality.phi1).toBeCloseTo(0.17, 6)
    expect(Number.isNaN(s.clockAffineQuality.phi2)).toBe(true)
    expect(s.version).toBe(v0 + 1)
  })

  it('setClockQuality does NOT overwrite snapshot', () => {
    const snap = makeSnapshot()
    useSrmtDiagnosticStore.getState().setDiagnostic(snap, {
      a: 0.05,
      phi1: Number.NaN,
      phi2: Number.NaN,
    })
    const before = useSrmtDiagnosticStore.getState().snapshot
    useSrmtDiagnosticStore.getState().setClockQuality('phi2', 0.3)
    expect(useSrmtDiagnosticStore.getState().snapshot).toBe(before)
  })

  it('setClockQuality accepts NaN (no-op merge keeps prior value pending)', () => {
    useSrmtDiagnosticStore.getState().setClockQuality('a', Number.NaN)
    expect(Number.isNaN(useSrmtDiagnosticStore.getState().clockAffineQuality.a)).toBe(true)
  })

  it('setClockQuality accumulates across successive calls until all three populated', () => {
    useSrmtDiagnosticStore.getState().setClockQuality('a', 0.05)
    useSrmtDiagnosticStore.getState().setClockQuality('phi1', 0.17)
    useSrmtDiagnosticStore.getState().setClockQuality('phi2', 0.24)
    const q = useSrmtDiagnosticStore.getState().clockAffineQuality
    expect(q.a).toBeCloseTo(0.05, 6)
    expect(q.phi1).toBeCloseTo(0.17, 6)
    expect(q.phi2).toBeCloseTo(0.24, 6)
  })
})
