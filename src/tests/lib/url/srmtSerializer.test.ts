/**
 * Tests for the SRMT URL sub-block serializer.
 *
 * The SRMT serializer is scope-guarded: it must NOT emit any params unless
 * `quantumMode === 'wheelerDeWitt'`. A regression in the guard would leak
 * SRMT fields into share links for unrelated quantum modes (a class of bug
 * the comment explicitly mentions). The deserializer is unscoped — applied
 * unconditionally — and `applyWdwParams` does the scope routing later.
 */

import { describe, expect, it } from 'vitest'

import type { SrmtUrlState } from '@/lib/url/srmtSerializer'
import { deserializeSrmt, serializeSrmt, VALID_SRMT_CLOCKS } from '@/lib/url/srmtSerializer'
import { VALID_QUANTUM_MODES } from '@/lib/url/state-serializer'

describe('serializeSrmt — scope guard', () => {
  it('no-ops when quantumMode is undefined', () => {
    const params = new URLSearchParams()
    serializeSrmt(params, undefined, { wdwSrmtEnabled: true, wdwSrmtClock: 'a' })
    expect([...params.keys()]).toEqual([])
  })

  it('no-ops when quantumMode is anything other than wheelerDeWitt', () => {
    // Derive the non-WdW set from the canonical mode list so adding a new
    // quantumMode automatically widens the guard's coverage.
    const nonWdwModes = VALID_QUANTUM_MODES.filter((m) => m !== 'wheelerDeWitt')
    expect(nonWdwModes.length).toBeGreaterThan(0)
    for (const mode of nonWdwModes) {
      const params = new URLSearchParams()
      serializeSrmt(params, mode, {
        wdwSrmtEnabled: true,
        wdwSrmtClock: 'a',
        wdwSrmtCutNormalized: 0.5,
        wdwSrmtRankCap: 32,
        wdwSrmtHeatmapIntensity: 0.5,
      })
      expect([...params.keys()]).toEqual([])
    }
  })

  it('emits SRMT block only when quantumMode === wheelerDeWitt', () => {
    const params = new URLSearchParams()
    serializeSrmt(params, 'wheelerDeWitt', {
      wdwSrmtEnabled: true,
      wdwSrmtClock: 'phi1',
      wdwSrmtCutNormalized: 0.42,
      wdwSrmtRankCap: 64,
      wdwSrmtHeatmapIntensity: 0.7,
    })
    expect(params.get('srmt')).toBe('1')
    expect(params.get('srmt_c')).toBe('phi1')
    expect(params.get('srmt_x')).toBe('0.42')
    expect(params.get('srmt_r')).toBe('64')
    expect(params.get('srmt_h')).toBe('0.70')
  })
})

describe('serializeSrmt — wire format', () => {
  it('emits srmt as 1 / 0 boolean', () => {
    const t = new URLSearchParams()
    serializeSrmt(t, 'wheelerDeWitt', { wdwSrmtEnabled: true })
    expect(t.get('srmt')).toBe('1')

    const f = new URLSearchParams()
    serializeSrmt(f, 'wheelerDeWitt', { wdwSrmtEnabled: false })
    expect(f.get('srmt')).toBe('0')
  })

  it('emits srmt_c verbatim for each valid clock', () => {
    for (const clock of VALID_SRMT_CLOCKS) {
      const params = new URLSearchParams()
      serializeSrmt(params, 'wheelerDeWitt', { wdwSrmtClock: clock })
      expect(params.get('srmt_c')).toBe(clock)
    }
  })

  it('emits srmt_x with 2-decimal precision', () => {
    const params = new URLSearchParams()
    serializeSrmt(params, 'wheelerDeWitt', { wdwSrmtCutNormalized: 0.123456 })
    expect(params.get('srmt_x')).toBe('0.12')
  })

  it('emits srmt_h with 2-decimal precision', () => {
    const params = new URLSearchParams()
    serializeSrmt(params, 'wheelerDeWitt', { wdwSrmtHeatmapIntensity: 0.987 })
    expect(params.get('srmt_h')).toBe('0.99')
  })

  it('omits srmt block keys for undefined fields (no spurious emissions)', () => {
    const params = new URLSearchParams()
    serializeSrmt(params, 'wheelerDeWitt', {})
    expect([...params.keys()]).toEqual([])
  })
})

describe('deserializeSrmt — validation', () => {
  it('parses srmt as boolean', () => {
    const t: SrmtUrlState = {}
    deserializeSrmt(new URLSearchParams('srmt=1'), t)
    expect(t.wdwSrmtEnabled).toBe(true)

    const f: SrmtUrlState = {}
    deserializeSrmt(new URLSearchParams('srmt=0'), f)
    expect(f.wdwSrmtEnabled).toBe(false)

    const bad: SrmtUrlState = {}
    deserializeSrmt(new URLSearchParams('srmt=true'), bad)
    expect(bad.wdwSrmtEnabled).toBeUndefined()
  })

  it('accepts only enumerated clocks; rejects others as undefined', () => {
    for (const clock of VALID_SRMT_CLOCKS) {
      const out: SrmtUrlState = {}
      deserializeSrmt(new URLSearchParams(`srmt_c=${clock}`), out)
      expect(out.wdwSrmtClock).toBe(clock)
    }
    const bad: SrmtUrlState = {}
    deserializeSrmt(new URLSearchParams('srmt_c=invalid'), bad)
    expect(bad.wdwSrmtClock).toBeUndefined()
  })

  it('clamps srmt_x into [0.1, 0.9]', () => {
    const lo: SrmtUrlState = {}
    deserializeSrmt(new URLSearchParams('srmt_x=0.001'), lo)
    expect(lo.wdwSrmtCutNormalized).toBe(0.1)

    const hi: SrmtUrlState = {}
    deserializeSrmt(new URLSearchParams('srmt_x=99'), hi)
    expect(hi.wdwSrmtCutNormalized).toBe(0.9)
  })

  it('clamps srmt_r into [8, 256] and rejects non-integer', () => {
    const lo: SrmtUrlState = {}
    deserializeSrmt(new URLSearchParams('srmt_r=1'), lo)
    expect(lo.wdwSrmtRankCap).toBe(8)

    const hi: SrmtUrlState = {}
    deserializeSrmt(new URLSearchParams('srmt_r=999'), hi)
    expect(hi.wdwSrmtRankCap).toBe(256)

    const dec: SrmtUrlState = {}
    deserializeSrmt(new URLSearchParams('srmt_r=32.5'), dec)
    // Integer-only field; decimal is rejected → undefined.
    expect(dec.wdwSrmtRankCap).toBeUndefined()
  })

  it('clamps srmt_h into [0, 1]', () => {
    const lo: SrmtUrlState = {}
    deserializeSrmt(new URLSearchParams('srmt_h=-1'), lo)
    expect(lo.wdwSrmtHeatmapIntensity).toBe(0)

    const hi: SrmtUrlState = {}
    deserializeSrmt(new URLSearchParams('srmt_h=99'), hi)
    expect(hi.wdwSrmtHeatmapIntensity).toBe(1)
  })

  it('rejects malformed numeric inputs', () => {
    const out: SrmtUrlState = {}
    deserializeSrmt(new URLSearchParams('srmt_x=abc&srmt_r=xyz&srmt_h=NaN'), out)
    expect(out.wdwSrmtCutNormalized).toBeUndefined()
    expect(out.wdwSrmtRankCap).toBeUndefined()
    expect(out.wdwSrmtHeatmapIntensity).toBeUndefined()
  })

  it('overwrites existing values with undefined when params are absent (per the in/out contract)', () => {
    const out: SrmtUrlState = {
      wdwSrmtEnabled: true,
      wdwSrmtClock: 'a',
      wdwSrmtCutNormalized: 0.5,
    }
    deserializeSrmt(new URLSearchParams(), out)
    expect(out.wdwSrmtEnabled).toBeUndefined()
    expect(out.wdwSrmtClock).toBeUndefined()
    expect(out.wdwSrmtCutNormalized).toBeUndefined()
  })
})

describe('round-trip', () => {
  it('preserves all fields when scoped to wheelerDeWitt', () => {
    const params = new URLSearchParams()
    serializeSrmt(params, 'wheelerDeWitt', {
      wdwSrmtEnabled: true,
      wdwSrmtClock: 'phi2',
      wdwSrmtCutNormalized: 0.5,
      wdwSrmtRankCap: 64,
      wdwSrmtHeatmapIntensity: 0.5,
    })
    const out: SrmtUrlState = {}
    deserializeSrmt(params, out)
    expect(out).toEqual({
      wdwSrmtEnabled: true,
      wdwSrmtClock: 'phi2',
      wdwSrmtCutNormalized: 0.5,
      wdwSrmtRankCap: 64,
      wdwSrmtHeatmapIntensity: 0.5,
    })
  })

  it('preserves srmt_x boundary values 0.1 and 0.9 exactly', () => {
    for (const x of [0.1, 0.9]) {
      const params = new URLSearchParams()
      serializeSrmt(params, 'wheelerDeWitt', { wdwSrmtCutNormalized: x })
      const out: SrmtUrlState = {}
      deserializeSrmt(params, out)
      expect(out.wdwSrmtCutNormalized).toBeCloseTo(x, 2)
    }
  })

  it('preserves srmt_r at boundary values 8 and 256', () => {
    for (const r of [8, 256]) {
      const params = new URLSearchParams()
      serializeSrmt(params, 'wheelerDeWitt', { wdwSrmtRankCap: r })
      const out: SrmtUrlState = {}
      deserializeSrmt(params, out)
      expect(out.wdwSrmtRankCap).toBe(r)
    }
  })

  it('VALID_SRMT_CLOCKS is the complete set of supported clocks (regression guard)', () => {
    expect([...VALID_SRMT_CLOCKS]).toEqual(['a', 'phi1', 'phi2'])
  })
})
