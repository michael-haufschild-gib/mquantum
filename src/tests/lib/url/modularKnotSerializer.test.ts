import { describe, expect, it } from 'vitest'

import {
  deserializeModularKnot,
  type ModularKnotUrlState,
  serializeModularKnot,
} from '@/lib/url/modularKnotSerializer'
import { deserializeState, serializeState } from '@/lib/url/state-serializer'

describe('modularKnotSerializer', () => {
  it('round-trips every field (floats 3-dp, ints exact)', () => {
    const params = new URLSearchParams()
    serializeModularKnot(params, {
      modularKnotPreset: 'primeGeodesics',
      modularKnotGlow: 1.8,
      modularKnotFlow: 0.42,
      modularKnotMaxLen: 6,
      modularKnotGeodesicCount: 10,
      modularKnotTubeWidth: 2.0,
    })

    expect(params.get('mk_preset')).toBe('primeGeodesics')
    expect(params.get('mk_glow')).toBe('1.800')
    expect(params.get('mk_flow')).toBe('0.420')
    // Integer fields are emitted as plain base-10 integers, not 3-dp floats.
    expect(params.get('mk_len')).toBe('6')
    expect(params.get('mk_n')).toBe('10')
    expect(params.get('mk_tube')).toBe('2.000')

    const state: ModularKnotUrlState = {}
    deserializeModularKnot(params, state)
    expect(state.modularKnotPreset).toBe('primeGeodesics')
    expect(state.modularKnotGlow).toBeCloseTo(1.8, 3)
    expect(state.modularKnotFlow).toBeCloseTo(0.42, 3)
    expect(state.modularKnotMaxLen).toBe(6)
    expect(state.modularKnotGeodesicCount).toBe(10)
    expect(state.modularKnotTubeWidth).toBeCloseTo(2.0, 3)
  })

  it('omits the preset param for custom and drops unknown ids on parse', () => {
    const params = new URLSearchParams()
    serializeModularKnot(params, { modularKnotPreset: 'custom' })
    expect(params.has('mk_preset')).toBe(false)

    const state: ModularKnotUrlState = {}
    deserializeModularKnot(new URLSearchParams('mk_preset=doesNotExist'), state)
    expect(state.modularKnotPreset).toBeUndefined()
  })

  it('clamps out-of-range values to MODULAR_KNOT_RANGES on parse', () => {
    const state: ModularKnotUrlState = {}
    deserializeModularKnot(
      new URLSearchParams('mk_glow=99&mk_flow=9&mk_len=99&mk_n=999&mk_tube=99'),
      state
    )
    expect(state.modularKnotGlow).toBeCloseTo(4, 6)
    expect(state.modularKnotFlow).toBeCloseTo(1.5, 6)
    expect(state.modularKnotMaxLen).toBe(10)
    expect(state.modularKnotGeodesicCount).toBe(64)
    expect(state.modularKnotTubeWidth).toBeCloseTo(3, 6)
  })

  it('clamps too-small values up to the lower bound', () => {
    const state: ModularKnotUrlState = {}
    deserializeModularKnot(new URLSearchParams('mk_glow=0&mk_len=1&mk_n=1&mk_tube=0'), state)
    expect(state.modularKnotGlow).toBeCloseTo(0.2, 6)
    expect(state.modularKnotMaxLen).toBe(4)
    expect(state.modularKnotGeodesicCount).toBe(6)
    expect(state.modularKnotTubeWidth).toBeCloseTo(0.6, 6)
  })

  it('rejects malformed values on parse (forward-compat rule)', () => {
    const state: ModularKnotUrlState = {}
    deserializeModularKnot(
      new URLSearchParams('mk_glow=abc&mk_flow=&mk_len=six&mk_n=2.5&mk_tube=xyz'),
      state
    )
    expect(state.modularKnotGlow).toBeUndefined()
    expect(state.modularKnotFlow).toBeUndefined()
    // Non-integer floats are rejected by parseIntParam.
    expect(state.modularKnotMaxLen).toBeUndefined()
    expect(state.modularKnotGeodesicCount).toBeUndefined()
    expect(state.modularKnotTubeWidth).toBeUndefined()
  })

  it('absent params leave fields undefined (defaults preserved downstream)', () => {
    const state: ModularKnotUrlState = {}
    deserializeModularKnot(new URLSearchParams(''), state)
    expect(state.modularKnotGlow).toBeUndefined()
    expect(state.modularKnotMaxLen).toBeUndefined()
    expect(state.modularKnotPreset).toBeUndefined()
  })
})

describe('state-serializer — modularKnot integration', () => {
  it('emits mk_* params only when qm=modularKnot', () => {
    const withMode = serializeState({
      dimension: 3,
      objectType: 'schroedinger',
      quantumMode: 'modularKnot',
      modularKnotGlow: 1.5,
      modularKnotMaxLen: 6,
    })
    expect(withMode).toContain('qm=modularKnot')
    expect(withMode).toContain('mk_glow=1.500')
    expect(withMode).toContain('mk_len=6')

    const otherMode = serializeState({
      dimension: 3,
      objectType: 'schroedinger',
      quantumMode: 'harmonicOscillator',
      modularKnotGlow: 1.5,
    })
    expect(otherMode).not.toContain('mk_glow')
  })

  it('parses qm=modularKnot and accepts mk_* params regardless of mode', () => {
    const state = deserializeState('d=3&t=schroedinger&qm=modularKnot&mk_glow=2.2&mk_n=12')
    expect(state.quantumMode).toBe('modularKnot')
    expect(state.modularKnotGlow).toBeCloseTo(2.2, 6)
    expect(state.modularKnotGeodesicCount).toBe(12)

    const noMode = deserializeState('d=3&t=schroedinger&mk_glow=2.2')
    expect(noMode.modularKnotGlow).toBeCloseTo(2.2, 6)
  })

  it('full URL round-trip preserves the modular knot state', () => {
    const serialized = serializeState({
      dimension: 3,
      objectType: 'schroedinger',
      quantumMode: 'modularKnot',
      modularKnotPreset: 'deepSpectrum',
      modularKnotGlow: 1.4,
      modularKnotFlow: 0.25,
      modularKnotMaxLen: 10,
      modularKnotGeodesicCount: 56,
      modularKnotTubeWidth: 1.2,
    })
    const parsed = deserializeState(serialized)
    expect(parsed.quantumMode).toBe('modularKnot')
    expect(parsed.modularKnotPreset).toBe('deepSpectrum')
    expect(parsed.modularKnotGlow).toBeCloseTo(1.4, 3)
    expect(parsed.modularKnotFlow).toBeCloseTo(0.25, 3)
    expect(parsed.modularKnotMaxLen).toBe(10)
    expect(parsed.modularKnotGeodesicCount).toBe(56)
    expect(parsed.modularKnotTubeWidth).toBeCloseTo(1.2, 3)
  })
})
