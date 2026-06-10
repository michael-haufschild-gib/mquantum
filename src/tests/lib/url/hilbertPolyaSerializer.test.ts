import { describe, expect, it } from 'vitest'

import {
  deserializeHilbertPolya,
  type HilbertPolyaUrlState,
  serializeHilbertPolya,
} from '@/lib/url/hilbertPolyaSerializer'
import { deserializeState, serializeState } from '@/lib/url/state-serializer'

describe('hilbertPolyaSerializer', () => {
  it('round-trips every field at 3-decimal precision', () => {
    const params = new URLSearchParams()
    serializeHilbertPolya(params, {
      hilbertPolyaPreset: 'matsubaraVeil',
      hilbertPolyaZMax: 64,
      hilbertPolyaYExtent: 0.85,
      hilbertPolyaFilamentWidth: 0.321,
      hilbertPolyaGlow: 2.5,
      hilbertPolyaFogGain: 0.75,
      hilbertPolyaPlaneMarker: true,
    })

    const state: HilbertPolyaUrlState = {}
    deserializeHilbertPolya(params, state)

    expect(state.hilbertPolyaPreset).toBe('matsubaraVeil')
    expect(state.hilbertPolyaZMax).toBe(64)
    expect(state.hilbertPolyaYExtent).toBeCloseTo(0.85, 3)
    expect(state.hilbertPolyaFilamentWidth).toBeCloseTo(0.321, 3)
    expect(state.hilbertPolyaGlow).toBeCloseTo(2.5, 3)
    expect(state.hilbertPolyaFogGain).toBeCloseTo(0.75, 3)
    expect(state.hilbertPolyaPlaneMarker).toBe(true)
  })

  it('round-trips planeMarker=false', () => {
    const params = new URLSearchParams()
    serializeHilbertPolya(params, { hilbertPolyaPlaneMarker: false })
    expect(params.get('hp_plane')).toBe('0')

    const state: HilbertPolyaUrlState = {}
    deserializeHilbertPolya(params, state)
    expect(state.hilbertPolyaPlaneMarker).toBe(false)
  })

  it('rounds a non-integer zMax to an integer on emit', () => {
    const params = new URLSearchParams()
    serializeHilbertPolya(params, { hilbertPolyaZMax: 119.6 })
    expect(params.get('hp_zmax')).toBe('120')
  })

  it('omits the preset param for custom and unknown ids on parse', () => {
    const params = new URLSearchParams()
    serializeHilbertPolya(params, { hilbertPolyaPreset: 'custom' })
    expect(params.has('hp_preset')).toBe(false)

    const state: HilbertPolyaUrlState = {}
    deserializeHilbertPolya(new URLSearchParams('hp_preset=doesNotExist'), state)
    expect(state.hilbertPolyaPreset).toBeUndefined()
  })

  it('clamps out-of-range values to HILBERT_POLYA_RANGES on parse', () => {
    const state: HilbertPolyaUrlState = {}
    deserializeHilbertPolya(
      new URLSearchParams('hp_zmax=999&hp_y=0.1&hp_fw=5&hp_glow=0&hp_fog=9'),
      state
    )
    expect(state.hilbertPolyaZMax).toBe(240)
    expect(state.hilbertPolyaYExtent).toBeCloseTo(0.6, 6)
    expect(state.hilbertPolyaFilamentWidth).toBeCloseTo(0.5, 6)
    expect(state.hilbertPolyaGlow).toBeCloseTo(0.2, 6)
    expect(state.hilbertPolyaFogGain).toBeCloseTo(2, 6)
  })

  it('clamps a too-small zMax up to the lower bound', () => {
    const state: HilbertPolyaUrlState = {}
    deserializeHilbertPolya(new URLSearchParams('hp_zmax=2'), state)
    expect(state.hilbertPolyaZMax).toBe(40)
  })

  it('rejects malformed values on parse (forward-compat rule)', () => {
    const state: HilbertPolyaUrlState = {}
    deserializeHilbertPolya(
      new URLSearchParams('hp_y=abc&hp_zmax=1.5&hp_fw=&hp_plane=2&hp_glow=two'),
      state
    )
    expect(state.hilbertPolyaYExtent).toBeUndefined()
    expect(state.hilbertPolyaZMax).toBeUndefined()
    expect(state.hilbertPolyaFilamentWidth).toBeUndefined()
    expect(state.hilbertPolyaPlaneMarker).toBeUndefined()
    expect(state.hilbertPolyaGlow).toBeUndefined()
  })
})

describe('state-serializer — hilbertPolya integration', () => {
  it('emits hp_* params only when qm=hilbertPolya', () => {
    const withMode = serializeState({
      dimension: 3,
      objectType: 'schroedinger',
      quantumMode: 'hilbertPolya',
      hilbertPolyaGlow: 1.25,
    })
    expect(withMode).toContain('qm=hilbertPolya')
    expect(withMode).toContain('hp_glow=1.25')

    const otherMode = serializeState({
      dimension: 3,
      objectType: 'schroedinger',
      quantumMode: 'harmonicOscillator',
      hilbertPolyaGlow: 1.25,
    })
    expect(otherMode).not.toContain('hp_glow')
  })

  it('parses qm=hilbertPolya and accepts hp_* params regardless of mode', () => {
    const state = deserializeState('d=3&t=schroedinger&qm=hilbertPolya&hp_glow=1.4&hp_zmax=42')
    expect(state.quantumMode).toBe('hilbertPolya')
    expect(state.hilbertPolyaGlow).toBeCloseTo(1.4, 6)
    expect(state.hilbertPolyaZMax).toBe(42)

    const noMode = deserializeState('d=3&t=schroedinger&hp_glow=1.4')
    expect(noMode.hilbertPolyaGlow).toBeCloseTo(1.4, 6)
  })

  it('full URL round-trip preserves the hilbert polya state', () => {
    const serialized = serializeState({
      dimension: 3,
      objectType: 'schroedinger',
      quantumMode: 'hilbertPolya',
      hilbertPolyaPreset: 'etaComb',
      hilbertPolyaZMax: 80,
      hilbertPolyaYExtent: 0.8,
      hilbertPolyaFilamentWidth: 0.2,
      hilbertPolyaGlow: 2,
      hilbertPolyaFogGain: 0.3,
      hilbertPolyaPlaneMarker: true,
    })
    const parsed = deserializeState(serialized)
    expect(parsed.dimension).toBe(3)
    expect(parsed.quantumMode).toBe('hilbertPolya')
    expect(parsed.hilbertPolyaPreset).toBe('etaComb')
    expect(parsed.hilbertPolyaZMax).toBe(80)
    expect(parsed.hilbertPolyaYExtent).toBeCloseTo(0.8, 3)
    expect(parsed.hilbertPolyaFilamentWidth).toBeCloseTo(0.2, 3)
    expect(parsed.hilbertPolyaGlow).toBeCloseTo(2, 3)
    expect(parsed.hilbertPolyaFogGain).toBeCloseTo(0.3, 3)
    expect(parsed.hilbertPolyaPlaneMarker).toBe(true)
  })
})
