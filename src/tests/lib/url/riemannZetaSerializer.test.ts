import { describe, expect, it } from 'vitest'

import {
  deserializeRiemannZeta,
  type RiemannZetaUrlState,
  serializeRiemannZeta,
} from '@/lib/url/riemannZetaSerializer'
import { deserializeState, serializeState } from '@/lib/url/state-serializer'

describe('riemannZetaSerializer', () => {
  it('round-trips every field at 3-decimal precision', () => {
    const params = new URLSearchParams()
    serializeRiemannZeta(params, {
      riemannZetaPreset: 'berryKeatingHorizon',
      riemannZetaSource: 'primes',
      riemannZetaNumZeros: 64,
      riemannZetaBeta: 1.234,
      riemannZetaHorizonRadius: 0.321,
      riemannZetaAngularL: 2,
      riemannZetaAngularM: -1,
      riemannZetaFlowRate: 0.75,
      riemannZetaGlow: 2.5,
      riemannZetaCutaway: true,
    })

    const state: RiemannZetaUrlState = {}
    deserializeRiemannZeta(params, state)

    expect(state.riemannZetaPreset).toBe('berryKeatingHorizon')
    expect(state.riemannZetaSource).toBe('primes')
    expect(state.riemannZetaNumZeros).toBe(64)
    expect(state.riemannZetaBeta).toBeCloseTo(1.234, 3)
    expect(state.riemannZetaHorizonRadius).toBeCloseTo(0.321, 3)
    expect(state.riemannZetaAngularL).toBe(2)
    expect(state.riemannZetaAngularM).toBe(-1)
    expect(state.riemannZetaFlowRate).toBeCloseTo(0.75, 3)
    expect(state.riemannZetaGlow).toBeCloseTo(2.5, 3)
    expect(state.riemannZetaCutaway).toBe(true)
  })

  it('round-trips the zeros source and cutaway=false', () => {
    const params = new URLSearchParams()
    serializeRiemannZeta(params, { riemannZetaSource: 'zeros', riemannZetaCutaway: false })
    expect(params.get('rz_src')).toBe('0')
    expect(params.get('rz_cut')).toBe('0')

    const state: RiemannZetaUrlState = {}
    deserializeRiemannZeta(params, state)
    expect(state.riemannZetaSource).toBe('zeros')
    expect(state.riemannZetaCutaway).toBe(false)
  })

  it('omits the preset param for custom and unknown ids on parse', () => {
    const params = new URLSearchParams()
    serializeRiemannZeta(params, { riemannZetaPreset: 'custom' })
    expect(params.has('rz_preset')).toBe(false)

    const state: RiemannZetaUrlState = {}
    deserializeRiemannZeta(new URLSearchParams('rz_preset=doesNotExist'), state)
    expect(state.riemannZetaPreset).toBeUndefined()
  })

  it('clamps out-of-range values to RIEMANN_ZETA_RANGES on parse', () => {
    const state: RiemannZetaUrlState = {}
    deserializeRiemannZeta(
      new URLSearchParams('rz_nz=999&rz_beta=0.5&rz_rh=2&rz_l=9&rz_m=-9&rz_flow=5&rz_glow=0'),
      state
    )
    expect(state.riemannZetaNumZeros).toBe(100)
    expect(state.riemannZetaBeta).toBeCloseTo(1.01, 6)
    expect(state.riemannZetaHorizonRadius).toBe(1)
    expect(state.riemannZetaAngularL).toBe(4)
    expect(state.riemannZetaAngularM).toBe(-4)
    expect(state.riemannZetaFlowRate).toBeCloseTo(1.5, 6)
    expect(state.riemannZetaGlow).toBeCloseTo(0.2, 6)
  })

  it('clamps a too-small zero count up to the lower bound', () => {
    const state: RiemannZetaUrlState = {}
    deserializeRiemannZeta(new URLSearchParams('rz_nz=2'), state)
    expect(state.riemannZetaNumZeros).toBe(8)
  })

  it('rejects malformed values on parse (forward-compat rule)', () => {
    const state: RiemannZetaUrlState = {}
    deserializeRiemannZeta(
      new URLSearchParams('rz_beta=abc&rz_nz=1.5&rz_rh=&rz_src=x&rz_cut=2&rz_l=two'),
      state
    )
    expect(state.riemannZetaBeta).toBeUndefined()
    expect(state.riemannZetaNumZeros).toBeUndefined()
    expect(state.riemannZetaHorizonRadius).toBeUndefined()
    expect(state.riemannZetaSource).toBeUndefined()
    expect(state.riemannZetaCutaway).toBeUndefined()
    expect(state.riemannZetaAngularL).toBeUndefined()
  })
})

describe('state-serializer — riemannZeta integration', () => {
  it('emits rz_* params only when qm=riemannZeta', () => {
    const withMode = serializeState({
      dimension: 3,
      objectType: 'schroedinger',
      quantumMode: 'riemannZeta',
      riemannZetaBeta: 1.25,
    })
    expect(withMode).toContain('qm=riemannZeta')
    expect(withMode).toContain('rz_beta=1.25')

    const otherMode = serializeState({
      dimension: 3,
      objectType: 'schroedinger',
      quantumMode: 'harmonicOscillator',
      riemannZetaBeta: 1.25,
    })
    expect(otherMode).not.toContain('rz_beta')
  })

  it('parses qm=riemannZeta and accepts rz_* params regardless of mode', () => {
    const state = deserializeState('d=4&t=schroedinger&qm=riemannZeta&rz_beta=1.4&rz_nz=42')
    expect(state.quantumMode).toBe('riemannZeta')
    expect(state.riemannZetaBeta).toBeCloseTo(1.4, 6)
    expect(state.riemannZetaNumZeros).toBe(42)

    const noMode = deserializeState('d=4&t=schroedinger&rz_beta=1.4')
    expect(noMode.riemannZetaBeta).toBeCloseTo(1.4, 6)
  })

  it('full URL round-trip preserves the riemann zeta state', () => {
    const serialized = serializeState({
      dimension: 5,
      objectType: 'schroedinger',
      quantumMode: 'riemannZeta',
      riemannZetaPreset: 'arithmeticChaos',
      riemannZetaSource: 'zeros',
      riemannZetaNumZeros: 100,
      riemannZetaBeta: 1.6,
      riemannZetaHorizonRadius: 0.15,
      riemannZetaAngularL: 2,
      riemannZetaAngularM: 1,
      riemannZetaFlowRate: 0.3,
      riemannZetaGlow: 1.5,
      riemannZetaCutaway: true,
    })
    const parsed = deserializeState(serialized)
    expect(parsed.dimension).toBe(5)
    expect(parsed.quantumMode).toBe('riemannZeta')
    expect(parsed.riemannZetaPreset).toBe('arithmeticChaos')
    expect(parsed.riemannZetaSource).toBe('zeros')
    expect(parsed.riemannZetaNumZeros).toBe(100)
    expect(parsed.riemannZetaBeta).toBeCloseTo(1.6, 3)
    expect(parsed.riemannZetaHorizonRadius).toBeCloseTo(0.15, 3)
    expect(parsed.riemannZetaAngularL).toBe(2)
    expect(parsed.riemannZetaAngularM).toBe(1)
    expect(parsed.riemannZetaFlowRate).toBeCloseTo(0.3, 3)
    expect(parsed.riemannZetaGlow).toBeCloseTo(1.5, 3)
    expect(parsed.riemannZetaCutaway).toBe(true)
  })
})
