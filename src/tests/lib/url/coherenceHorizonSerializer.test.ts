import { describe, expect, it } from 'vitest'

import {
  type CoherenceHorizonUrlState,
  deserializeCoherenceHorizon,
  serializeCoherenceHorizon,
} from '@/lib/url/coherenceHorizonSerializer'
import { deserializeState, serializeState } from '@/lib/url/state-serializer'

describe('coherenceHorizonSerializer', () => {
  it('round-trips every field at 3-decimal precision', () => {
    const params = new URLSearchParams()
    serializeCoherenceHorizon(params, {
      coherenceHorizonPreset: 'criticalRing',
      coherenceHorizonDecoherence: 0.333,
      coherenceHorizonSeparation: 1.234,
      coherenceHorizonWidth: 0.456,
      coherenceHorizonWaveNumber: 7.5,
      coherenceHorizonScale: 0.6,
      coherenceHorizonRingGain: 2.6,
      coherenceHorizonGlow: 1.6,
    })

    const state: CoherenceHorizonUrlState = {}
    deserializeCoherenceHorizon(params, state)

    expect(state.coherenceHorizonPreset).toBe('criticalRing')
    expect(state.coherenceHorizonDecoherence).toBeCloseTo(0.333, 3)
    expect(state.coherenceHorizonSeparation).toBeCloseTo(1.234, 3)
    expect(state.coherenceHorizonWidth).toBeCloseTo(0.456, 3)
    expect(state.coherenceHorizonWaveNumber).toBeCloseTo(7.5, 3)
    expect(state.coherenceHorizonScale).toBeCloseTo(0.6, 3)
    expect(state.coherenceHorizonRingGain).toBeCloseTo(2.6, 3)
    expect(state.coherenceHorizonGlow).toBeCloseTo(1.6, 3)
  })

  it('omits the preset param for custom and unknown ids on parse', () => {
    const params = new URLSearchParams()
    serializeCoherenceHorizon(params, { coherenceHorizonPreset: 'custom' })
    expect(params.has('ch_preset')).toBe(false)

    const state: CoherenceHorizonUrlState = {}
    deserializeCoherenceHorizon(new URLSearchParams('ch_preset=doesNotExist'), state)
    expect(state.coherenceHorizonPreset).toBeUndefined()
  })

  it('clamps out-of-range values to the documented ranges on parse', () => {
    const state: CoherenceHorizonUrlState = {}
    deserializeCoherenceHorizon(
      new URLSearchParams('ch_dec=1.5&ch_sep=99&ch_w=0.01&ch_k=-3&ch_hs=2&ch_rg=9&ch_glow=0'),
      state
    )
    expect(state.coherenceHorizonDecoherence).toBe(1)
    expect(state.coherenceHorizonSeparation).toBe(3)
    expect(state.coherenceHorizonWidth).toBeCloseTo(0.15, 6)
    expect(state.coherenceHorizonWaveNumber).toBe(0)
    expect(state.coherenceHorizonScale).toBeCloseTo(1.2, 6)
    expect(state.coherenceHorizonRingGain).toBe(4)
    expect(state.coherenceHorizonGlow).toBeCloseTo(0.2, 6)
  })

  it('rejects malformed values on parse (forward-compat rule)', () => {
    const state: CoherenceHorizonUrlState = {}
    deserializeCoherenceHorizon(new URLSearchParams('ch_dec=abc&ch_sep=&ch_hs=1e9x'), state)
    expect(state.coherenceHorizonDecoherence).toBeUndefined()
    expect(state.coherenceHorizonSeparation).toBeUndefined()
    expect(state.coherenceHorizonScale).toBeUndefined()
  })
})

describe('state-serializer — coherenceHorizon integration', () => {
  it('emits ch_* params only when qm=coherenceHorizon', () => {
    const withMode = serializeState({
      dimension: 3,
      objectType: 'schroedinger',
      quantumMode: 'coherenceHorizon',
      coherenceHorizonDecoherence: 0.25,
    })
    expect(withMode).toContain('qm=coherenceHorizon')
    expect(withMode).toContain('ch_dec=0.25')

    const otherMode = serializeState({
      dimension: 3,
      objectType: 'schroedinger',
      quantumMode: 'harmonicOscillator',
      coherenceHorizonDecoherence: 0.25,
    })
    expect(otherMode).not.toContain('ch_dec')
  })

  it('parses qm=coherenceHorizon and accepts ch_* params regardless of mode', () => {
    const state = deserializeState('d=4&t=schroedinger&qm=coherenceHorizon&ch_dec=0.4&ch_hs=0.55')
    expect(state.quantumMode).toBe('coherenceHorizon')
    expect(state.coherenceHorizonDecoherence).toBeCloseTo(0.4, 6)
    expect(state.coherenceHorizonScale).toBeCloseTo(0.55, 6)

    const noMode = deserializeState('d=4&t=schroedinger&ch_dec=0.4')
    expect(noMode.coherenceHorizonDecoherence).toBeCloseTo(0.4, 6)
  })

  it('full URL round-trip preserves the coherence horizon state', () => {
    const serialized = serializeState({
      dimension: 6,
      objectType: 'schroedinger',
      quantumMode: 'coherenceHorizon',
      coherenceHorizonPreset: 'hyperLens6D',
      coherenceHorizonDecoherence: 0,
      coherenceHorizonSeparation: 1.4,
      coherenceHorizonWidth: 0.4,
      coherenceHorizonWaveNumber: 6,
      coherenceHorizonScale: 0.55,
      coherenceHorizonRingGain: 2,
      coherenceHorizonGlow: 1.3,
    })
    const parsed = deserializeState(serialized)
    expect(parsed.dimension).toBe(6)
    expect(parsed.quantumMode).toBe('coherenceHorizon')
    expect(parsed.coherenceHorizonPreset).toBe('hyperLens6D')
    expect(parsed.coherenceHorizonSeparation).toBeCloseTo(1.4, 3)
    expect(parsed.coherenceHorizonScale).toBeCloseTo(0.55, 3)
    expect(parsed.coherenceHorizonRingGain).toBeCloseTo(2, 3)
  })
})
