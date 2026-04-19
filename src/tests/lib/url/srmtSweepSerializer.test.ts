/**
 * Unit tests for the SRMT sweep URL sub-block.
 */

import { describe, expect, it } from 'vitest'

import {
  deserializeSrmtSweep,
  serializeSrmtSweep,
  type SrmtSweepUrlState,
} from '@/lib/url/srmtSweepSerializer'

describe('serializeSrmtSweep', () => {
  it('no-ops outside wheelerDeWitt mode', () => {
    const params = new URLSearchParams()
    serializeSrmtSweep(params, 'freeScalarField', { srmtSweepKind: 'cut', srmtSweepPoints: 17 })
    expect(params.toString()).toBe('')
  })

  it('emits all sw_* params for a cut sweep', () => {
    const params = new URLSearchParams()
    serializeSrmtSweep(params, 'wheelerDeWitt', {
      srmtSweepKind: 'cut',
      srmtSweepPoints: 17,
      srmtSweepMin: 0.1,
      srmtSweepMax: 0.9,
      srmtSweepPhiRef: 1,
      srmtSweepCutAnchor: 0.5,
    })
    expect(params.get('sw')).toBe('cut')
    expect(params.get('sw_n')).toBe('17')
    expect(params.get('sw_min')).toBe('0.100')
    expect(params.get('sw_max')).toBe('0.900')
    expect(params.get('sw_phi')).toBe('1.000')
    expect(params.get('sw_c')).toBe('0.50')
  })

  it('emits sw_min/sw_max/sw_n for the lambda kind (numeric-range sweep)', () => {
    const params = new URLSearchParams()
    serializeSrmtSweep(params, 'wheelerDeWitt', {
      srmtSweepKind: 'lambda',
      srmtSweepPoints: 9,
      srmtSweepMin: -0.5,
      srmtSweepMax: 0.5,
      srmtSweepPhiRef: 1,
      srmtSweepCutAnchor: 0.5,
    })
    expect(params.get('sw')).toBe('lambda')
    expect(params.get('sw_n')).toBe('9')
    expect(params.get('sw_min')).toBe('-0.500')
    expect(params.get('sw_max')).toBe('0.500')
  })

  it('omits sw_min/max/n for bc kind', () => {
    const params = new URLSearchParams()
    serializeSrmtSweep(params, 'wheelerDeWitt', {
      srmtSweepKind: 'bc',
      srmtSweepPoints: 3,
      srmtSweepMin: 0,
      srmtSweepMax: 2,
      srmtSweepPhiRef: 0.8,
      srmtSweepCutAnchor: 0.5,
    })
    expect(params.get('sw')).toBe('bc')
    expect(params.has('sw_n')).toBe(false)
    expect(params.has('sw_min')).toBe(false)
    expect(params.has('sw_max')).toBe(false)
    // phi and anchor still emitted (needed for mass/bc landmark + anchor).
    expect(params.get('sw_phi')).toBe('0.800')
    expect(params.get('sw_c')).toBe('0.50')
  })
})

describe('deserializeSrmtSweep', () => {
  it('round-trips a cut sweep', () => {
    const params = new URLSearchParams('sw=cut&sw_n=17&sw_min=0.1&sw_max=0.9&sw_phi=1&sw_c=0.5')
    const state: SrmtSweepUrlState = {}
    deserializeSrmtSweep(params, state)
    expect(state.srmtSweepKind).toBe('cut')
    expect(state.srmtSweepPoints).toBe(17)
    expect(state.srmtSweepMin).toBe(0.1)
    expect(state.srmtSweepMax).toBe(0.9)
    expect(state.srmtSweepPhiRef).toBe(1)
    expect(state.srmtSweepCutAnchor).toBe(0.5)
  })

  it('round-trips a lambda sweep with a negative lower bound', () => {
    const params = new URLSearchParams('sw=lambda&sw_n=9&sw_min=-0.5&sw_max=0.5&sw_phi=1&sw_c=0.5')
    const state: SrmtSweepUrlState = {}
    deserializeSrmtSweep(params, state)
    expect(state.srmtSweepKind).toBe('lambda')
    expect(state.srmtSweepPoints).toBe(9)
    expect(state.srmtSweepMin).toBe(-0.5)
    expect(state.srmtSweepMax).toBe(0.5)
  })

  it('rejects unknown sw values', () => {
    const params = new URLSearchParams('sw=bogus')
    const state: SrmtSweepUrlState = {}
    deserializeSrmtSweep(params, state)
    expect(state.srmtSweepKind).toBeUndefined()
  })

  it('clamps sw_n, sw_c', () => {
    const params = new URLSearchParams('sw=cut&sw_n=9999&sw_c=1.5')
    const state: SrmtSweepUrlState = {}
    deserializeSrmtSweep(params, state)
    expect(state.srmtSweepPoints).toBe(64)
    expect(state.srmtSweepCutAnchor).toBe(0.9)
  })

  it('round-trips a rankCap sweep with integer bounds beyond the old [-10,10] box', () => {
    const params = new URLSearchParams('sw=rankCap&sw_n=9&sw_min=8&sw_max=128&sw_c=0.5')
    const state: SrmtSweepUrlState = {}
    deserializeSrmtSweep(params, state)
    expect(state.srmtSweepKind).toBe('rankCap')
    expect(state.srmtSweepPoints).toBe(9)
    // rankCap values must survive parse — driver clamps per-kind.
    expect(state.srmtSweepMin).toBe(8)
    expect(state.srmtSweepMax).toBe(128)
    expect(state.srmtSweepCutAnchor).toBe(0.5)
  })

  it('round-trips phiRef and phiExtent kinds', () => {
    const phiRef = new URLSearchParams(
      'sw=phiRef&sw_n=11&sw_min=0.05&sw_max=1.9&sw_phi=0.8&sw_c=0.5'
    )
    const s1: SrmtSweepUrlState = {}
    deserializeSrmtSweep(phiRef, s1)
    expect(s1.srmtSweepKind).toBe('phiRef')
    expect(s1.srmtSweepMin).toBe(0.05)
    expect(s1.srmtSweepMax).toBe(1.9)

    const phiExt = new URLSearchParams('sw=phiExtent&sw_n=5&sw_min=1.0&sw_max=3.0&sw_c=0.5')
    const s2: SrmtSweepUrlState = {}
    deserializeSrmtSweep(phiExt, s2)
    expect(s2.srmtSweepKind).toBe('phiExtent')
    expect(s2.srmtSweepPoints).toBe(5)
    expect(s2.srmtSweepMin).toBe(1.0)
    expect(s2.srmtSweepMax).toBe(3.0)
  })

  it('clamps sw_min / sw_max to [-300, 300] on pathological input', () => {
    const params = new URLSearchParams('sw=rankCap&sw_min=-9999&sw_max=99999')
    const state: SrmtSweepUrlState = {}
    deserializeSrmtSweep(params, state)
    expect(state.srmtSweepMin).toBe(-300)
    expect(state.srmtSweepMax).toBe(300)
  })
})

describe('serializeSrmtSweep — Tier-3 sensitivity kinds', () => {
  it('emits sw_n/min/max for phiRef, rankCap, phiExtent', () => {
    for (const kind of ['phiRef', 'rankCap', 'phiExtent'] as const) {
      const params = new URLSearchParams()
      serializeSrmtSweep(params, 'wheelerDeWitt', {
        srmtSweepKind: kind,
        srmtSweepPoints: 9,
        srmtSweepMin: 0.5,
        srmtSweepMax: 2.5,
        srmtSweepPhiRef: 0.7,
        srmtSweepCutAnchor: 0.5,
      })
      expect(params.get('sw')).toBe(kind)
      expect(params.get('sw_n')).toBe('9')
      expect(params.get('sw_min')).toBe('0.500')
      expect(params.get('sw_max')).toBe('2.500')
    }
  })
})
