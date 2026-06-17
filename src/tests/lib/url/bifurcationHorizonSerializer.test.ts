import { describe, expect, it } from 'vitest'

import {
  type BifurcationHorizonUrlState,
  deserializeBifurcationHorizon,
  serializeBifurcationHorizon,
} from '@/lib/url/bifurcationHorizonSerializer'
import { deserializeState, serializeState } from '@/lib/url/state-serializer'

describe('bifurcationHorizonSerializer', () => {
  it('round-trips every field at 3-decimal precision', () => {
    const params = new URLSearchParams()
    serializeBifurcationHorizon(params, {
      bifurcationHorizonPreset: 'modularFlow',
      bifurcationHorizonNeckRadius: 0.222,
      bifurcationHorizonThroatWidth: 0.18,
      bifurcationHorizonGlow: 1.4,
      bifurcationHorizonFlowRate: 0.6,
      bifurcationHorizonSwirl: 0.4,
      bifurcationHorizonRedshiftRadius: 0.45,
      bifurcationHorizonOffLine: 0.35,
      bifurcationHorizonWinding: 1.2,
      bifurcationHorizonThermalGain: 0.5,
    })

    // Distinct keys — must NOT collide with the TDSE ringdown keys.
    expect(params.has('bh_m')).toBe(false)
    expect(params.has('bh_l')).toBe(false)
    expect(params.has('bh_s')).toBe(false)
    expect(params.get('bh_off')).toBe('0.350')

    const state: BifurcationHorizonUrlState = {}
    deserializeBifurcationHorizon(params, state)

    expect(state.bifurcationHorizonPreset).toBe('modularFlow')
    expect(state.bifurcationHorizonNeckRadius).toBeCloseTo(0.222, 3)
    expect(state.bifurcationHorizonThroatWidth).toBeCloseTo(0.18, 3)
    expect(state.bifurcationHorizonGlow).toBeCloseTo(1.4, 3)
    expect(state.bifurcationHorizonFlowRate).toBeCloseTo(0.6, 3)
    expect(state.bifurcationHorizonSwirl).toBeCloseTo(0.4, 3)
    expect(state.bifurcationHorizonRedshiftRadius).toBeCloseTo(0.45, 3)
    expect(state.bifurcationHorizonOffLine).toBeCloseTo(0.35, 3)
    expect(state.bifurcationHorizonWinding).toBeCloseTo(1.2, 3)
    expect(state.bifurcationHorizonThermalGain).toBeCloseTo(0.5, 3)
  })

  it('omits the preset param for custom and drops unknown ids on parse', () => {
    const params = new URLSearchParams()
    serializeBifurcationHorizon(params, { bifurcationHorizonPreset: 'custom' })
    expect(params.has('bh_preset')).toBe(false)

    const state: BifurcationHorizonUrlState = {}
    deserializeBifurcationHorizon(new URLSearchParams('bh_preset=doesNotExist'), state)
    expect(state.bifurcationHorizonPreset).toBeUndefined()
  })

  it('clamps out-of-range values to BIFURCATION_HORIZON_RANGES on parse', () => {
    const state: BifurcationHorizonUrlState = {}
    deserializeBifurcationHorizon(
      new URLSearchParams(
        'bh_neck=2&bh_throat=0&bh_glow=99&bh_flow=5&bh_swirl=9&bh_rs=2&bh_off=9&bh_wind=99&bh_therm=9'
      ),
      state
    )
    expect(state.bifurcationHorizonNeckRadius).toBeCloseTo(0.6, 6)
    expect(state.bifurcationHorizonThroatWidth).toBeCloseTo(0.05, 6)
    expect(state.bifurcationHorizonGlow).toBeCloseTo(4, 6)
    expect(state.bifurcationHorizonFlowRate).toBeCloseTo(1.5, 6)
    expect(state.bifurcationHorizonSwirl).toBeCloseTo(2, 6)
    expect(state.bifurcationHorizonRedshiftRadius).toBeCloseTo(1, 6)
    expect(state.bifurcationHorizonOffLine).toBeCloseTo(0.6, 6)
    expect(state.bifurcationHorizonWinding).toBeCloseTo(4, 6)
    expect(state.bifurcationHorizonThermalGain).toBeCloseTo(2, 6)
  })

  it('clamps a too-small neck radius up to the lower bound', () => {
    const state: BifurcationHorizonUrlState = {}
    deserializeBifurcationHorizon(new URLSearchParams('bh_neck=0.001'), state)
    expect(state.bifurcationHorizonNeckRadius).toBeCloseTo(0.05, 6)
  })

  it('rejects malformed values on parse (forward-compat rule)', () => {
    const state: BifurcationHorizonUrlState = {}
    deserializeBifurcationHorizon(
      new URLSearchParams('bh_neck=abc&bh_glow=&bh_off=xyz&bh_wind=two'),
      state
    )
    expect(state.bifurcationHorizonNeckRadius).toBeUndefined()
    expect(state.bifurcationHorizonGlow).toBeUndefined()
    expect(state.bifurcationHorizonOffLine).toBeUndefined()
    expect(state.bifurcationHorizonWinding).toBeUndefined()
  })

  it('absent params leave fields undefined (defaults preserved downstream)', () => {
    const state: BifurcationHorizonUrlState = {}
    deserializeBifurcationHorizon(new URLSearchParams(''), state)
    expect(state.bifurcationHorizonNeckRadius).toBeUndefined()
    expect(state.bifurcationHorizonPreset).toBeUndefined()
    expect(state.bifurcationHorizonOffLine).toBeUndefined()
  })

  it('round-trips the living-log-gas dynamics fields (enum as int)', () => {
    const params = new URLSearchParams()
    serializeBifurcationHorizon(params, {
      bifurcationHorizonSpectralDynamics: 'softMode',
      bifurcationHorizonDynamicsAmplitude: 0.5,
      bifurcationHorizonDynamicsRate: 2.25,
      bifurcationHorizonStiffnessTint: 0.6,
    })
    expect(params.get('bh_dyn')).toBe('1')
    expect(params.get('bh_dynA')).toBe('0.500')
    expect(params.get('bh_dynR')).toBe('2.250')
    expect(params.get('bh_stiff')).toBe('0.600')

    const state: BifurcationHorizonUrlState = {}
    deserializeBifurcationHorizon(params, state)
    expect(state.bifurcationHorizonSpectralDynamics).toBe('softMode')
    expect(state.bifurcationHorizonDynamicsAmplitude).toBeCloseTo(0.5, 3)
    expect(state.bifurcationHorizonDynamicsRate).toBeCloseTo(2.25, 3)
    expect(state.bifurcationHorizonStiffnessTint).toBeCloseTo(0.6, 3)
  })

  it('maps the bh_dyn enum int → mode for every value', () => {
    const cases: [string, string][] = [
      ['0', 'static'],
      ['1', 'softMode'],
      ['2', 'dyson'],
    ]
    for (const [raw, mode] of cases) {
      const state: BifurcationHorizonUrlState = {}
      deserializeBifurcationHorizon(new URLSearchParams(`bh_dyn=${raw}`), state)
      expect(state.bifurcationHorizonSpectralDynamics).toBe(mode)
    }
  })

  it('omits default dynamics fields from the wire', () => {
    // Defaults: static / 0.4 / 1 / 0.4 — none should be emitted.
    const params = new URLSearchParams()
    serializeBifurcationHorizon(params, {
      bifurcationHorizonSpectralDynamics: 'static',
      bifurcationHorizonDynamicsAmplitude: 0.4,
      bifurcationHorizonDynamicsRate: 1,
      bifurcationHorizonStiffnessTint: 0.4,
    })
    expect(params.has('bh_dyn')).toBe(false)
    expect(params.has('bh_dynA')).toBe(false)
    expect(params.has('bh_dynR')).toBe(false)
    expect(params.has('bh_stiff')).toBe(false)
  })

  it('clamps out-of-range dynamics fields on parse', () => {
    const state: BifurcationHorizonUrlState = {}
    deserializeBifurcationHorizon(new URLSearchParams('bh_dynA=9&bh_dynR=99&bh_stiff=9'), state)
    expect(state.bifurcationHorizonDynamicsAmplitude).toBeCloseTo(1, 6)
    expect(state.bifurcationHorizonDynamicsRate).toBeCloseTo(3, 6)
    expect(state.bifurcationHorizonStiffnessTint).toBeCloseTo(1, 6)
  })

  it('drops an out-of-range bh_dyn enum index', () => {
    const state: BifurcationHorizonUrlState = {}
    // parseIntParam clamps to [0,2], so 5 → 2 (dyson). A non-numeric is dropped.
    deserializeBifurcationHorizon(new URLSearchParams('bh_dyn=nope'), state)
    expect(state.bifurcationHorizonSpectralDynamics).toBeUndefined()
  })
})

describe('state-serializer — bifurcationHorizon integration', () => {
  it('emits bh_* params only when qm=bifurcationHorizon', () => {
    const withMode = serializeState({
      dimension: 3,
      objectType: 'schroedinger',
      quantumMode: 'bifurcationHorizon',
      bifurcationHorizonGlow: 1.5,
      bifurcationHorizonOffLine: 0.25,
    })
    expect(withMode).toContain('qm=bifurcationHorizon')
    expect(withMode).toContain('bh_glow=1.5')
    expect(withMode).toContain('bh_off=0.25')

    const otherMode = serializeState({
      dimension: 3,
      objectType: 'schroedinger',
      quantumMode: 'harmonicOscillator',
      bifurcationHorizonGlow: 1.5,
    })
    expect(otherMode).not.toContain('bh_glow')
  })

  it('parses qm=bifurcationHorizon and accepts bh_* params regardless of mode', () => {
    const state = deserializeState(
      'd=4&t=schroedinger&qm=bifurcationHorizon&bh_glow=2.2&bh_off=0.3'
    )
    expect(state.quantumMode).toBe('bifurcationHorizon')
    expect(state.bifurcationHorizonGlow).toBeCloseTo(2.2, 6)
    expect(state.bifurcationHorizonOffLine).toBeCloseTo(0.3, 6)

    const noMode = deserializeState('d=4&t=schroedinger&bh_glow=2.2')
    expect(noMode.bifurcationHorizonGlow).toBeCloseTo(2.2, 6)
  })

  it('full URL round-trip preserves the bifurcation horizon state', () => {
    const serialized = serializeState({
      dimension: 5,
      objectType: 'schroedinger',
      quantumMode: 'bifurcationHorizon',
      bifurcationHorizonPreset: 'wedgeMirror',
      bifurcationHorizonNeckRadius: 0.24,
      bifurcationHorizonThroatWidth: 0.2,
      bifurcationHorizonGlow: 1.4,
      bifurcationHorizonFlowRate: 0.15,
      bifurcationHorizonSwirl: 0.6,
      bifurcationHorizonRedshiftRadius: 0,
      bifurcationHorizonOffLine: 0.35,
      bifurcationHorizonWinding: 1.2,
      bifurcationHorizonThermalGain: 0.5,
    })
    const parsed = deserializeState(serialized)
    expect(parsed.dimension).toBe(5)
    expect(parsed.quantumMode).toBe('bifurcationHorizon')
    expect(parsed.bifurcationHorizonPreset).toBe('wedgeMirror')
    expect(parsed.bifurcationHorizonNeckRadius).toBeCloseTo(0.24, 3)
    expect(parsed.bifurcationHorizonThroatWidth).toBeCloseTo(0.2, 3)
    expect(parsed.bifurcationHorizonGlow).toBeCloseTo(1.4, 3)
    expect(parsed.bifurcationHorizonFlowRate).toBeCloseTo(0.15, 3)
    expect(parsed.bifurcationHorizonSwirl).toBeCloseTo(0.6, 3)
    expect(parsed.bifurcationHorizonRedshiftRadius ?? 0).toBeCloseTo(0, 3)
    expect(parsed.bifurcationHorizonOffLine).toBeCloseTo(0.35, 3)
    expect(parsed.bifurcationHorizonWinding).toBeCloseTo(1.2, 3)
    expect(parsed.bifurcationHorizonThermalGain).toBeCloseTo(0.5, 3)
  })

  it('full URL round-trip preserves the living-log-gas dynamics state', () => {
    const serialized = serializeState({
      dimension: 3,
      objectType: 'schroedinger',
      quantumMode: 'bifurcationHorizon',
      bifurcationHorizonSpectralDynamics: 'dyson',
      bifurcationHorizonDynamicsAmplitude: 0.7,
      bifurcationHorizonDynamicsRate: 2,
      bifurcationHorizonStiffnessTint: 0.8,
    })
    expect(serialized).toContain('bh_dyn=2')
    const parsed = deserializeState(serialized)
    expect(parsed.bifurcationHorizonSpectralDynamics).toBe('dyson')
    expect(parsed.bifurcationHorizonDynamicsAmplitude).toBeCloseTo(0.7, 3)
    expect(parsed.bifurcationHorizonDynamicsRate).toBeCloseTo(2, 3)
    expect(parsed.bifurcationHorizonStiffnessTint).toBeCloseTo(0.8, 3)
  })

  it('does not emit bh_dyn* when qm is not bifurcationHorizon', () => {
    const otherMode = serializeState({
      dimension: 3,
      objectType: 'schroedinger',
      quantumMode: 'harmonicOscillator',
      bifurcationHorizonSpectralDynamics: 'dyson',
    })
    expect(otherMode).not.toContain('bh_dyn')
  })
})
