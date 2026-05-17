/**
 * Tests for the Bell-pair / CHSH URL sub-block serializer.
 *
 * `bellSerializer` is the contract that defines what a shareable
 * Bell-test link looks like. A regression here silently breaks the
 * share flow: recipients open a link and see the *wrong* angles or
 * loophole parameters, not an error. These tests pin every wire-format
 * detail and verify that every input is round-trip safe.
 */

import { describe, expect, it } from 'vitest'

import { CANONICAL_CHSH_PHI } from '@/lib/physics/bell/analytic'
import type { BellUrlState } from '@/lib/url/bellSerializer'
import { deserializeBell, serializeBell } from '@/lib/url/bellSerializer'

function roundTrip(input: BellUrlState): BellUrlState {
  const params = new URLSearchParams()
  serializeBell(params, input)
  const out: BellUrlState = {}
  deserializeBell(params, out)
  // Strip undefined so equality compares only present fields.
  for (const k of Object.keys(out) as Array<keyof BellUrlState>) {
    if (out[k] === undefined) delete out[k]
  }
  return out
}

describe('serializeBell — wire format', () => {
  it('emits axis params with 4-decimal precision (~0.006° angular resolution)', () => {
    const params = new URLSearchParams()
    serializeBell(params, {
      bellAliceAxis: [Math.PI / 2, 0],
      bellAliceAxisPrime: [Math.PI / 2, Math.PI / 2],
      bellBobAxis: [Math.PI / 2, Math.PI / 4],
      bellBobAxisPrime: [Math.PI / 2, (3 * Math.PI) / 4],
    })
    // 4-decimal toFixed: π/2 = 1.5708, π/4 = 0.7854, 3π/4 = 2.3562
    expect(params.get('bell_at')).toBe('1.5708')
    expect(params.get('bell_ap')).toBe('0.0000')
    expect(params.get('bell_apt')).toBe('1.5708')
    expect(params.get('bell_app')).toBe('1.5708')
    expect(params.get('bell_bt')).toBe('1.5708')
    expect(params.get('bell_bp')).toBe('0.7854')
    expect(params.get('bell_bpt')).toBe('1.5708')
    expect(params.get('bell_bpp')).toBe('2.3562')
  })

  it('emits visibility and η as floats with the same precision; analysisMode as string', () => {
    const params = new URLSearchParams()
    serializeBell(params, {
      bellVisibility: 0.85,
      bellDetectionEfficiency: 0.9,
      bellAnalysisMode: 'fairSampling',
    })
    expect(params.get('bell_v')).toBe('0.8500')
    expect(params.get('bell_eta')).toBe('0.9000')
    expect(params.get('bell_an')).toBe('fairSampling')
  })

  it('emits the per-particle field vectors as three components each', () => {
    const params = new URLSearchParams()
    serializeBell(params, {
      bellFieldA: [0.5, 0, 0],
      bellFieldB: [0, 0.5, 0],
    })
    expect(params.get('bell_bax')).toBe('0.5000')
    expect(params.get('bell_bay')).toBe('0.0000')
    expect(params.get('bell_baz')).toBe('0.0000')
    expect(params.get('bell_bbx')).toBe('0.0000')
    expect(params.get('bell_bby')).toBe('0.5000')
    expect(params.get('bell_bbz')).toBe('0.0000')
  })

  it('emits sampler/LHV/N/tpf/seed', () => {
    const params = new URLSearchParams()
    serializeBell(params, {
      bellSamplerMode: 'lhv',
      bellLhvStrategyId: 'deterministicBell',
      bellTargetTrials: 50_000,
      bellTrialsPerFrame: 100,
      bellSeed: 42,
    })
    expect(params.get('bell_m')).toBe('lhv')
    expect(params.get('bell_lhv')).toBe('deterministicBell')
    expect(params.get('bell_n')).toBe('50000')
    expect(params.get('bell_tpf')).toBe('100')
    expect(params.get('bell_seed')).toBe('42')
  })

  it('omits every field when state is empty', () => {
    const params = new URLSearchParams()
    serializeBell(params, {})
    expect(params.toString()).toBe('')
  })
})

describe('roundTrip — Bell-pair URL state', () => {
  it('preserves canonical CHSH defaults', () => {
    const input: BellUrlState = {
      bellAliceAxis: [Math.PI / 2, CANONICAL_CHSH_PHI.a],
      bellAliceAxisPrime: [Math.PI / 2, CANONICAL_CHSH_PHI.aPrime],
      bellBobAxis: [Math.PI / 2, CANONICAL_CHSH_PHI.b],
      bellBobAxisPrime: [Math.PI / 2, CANONICAL_CHSH_PHI.bPrime],
      bellVisibility: 1,
      bellDetectionEfficiency: 1,
      bellAnalysisMode: 'fairSampling',
      bellFieldA: [0, 0, 0],
      bellFieldB: [0, 0, 0],
      bellSamplerMode: 'qm',
      bellLhvStrategyId: 'deterministicBell',
      bellTargetTrials: 10_000,
      bellTrialsPerFrame: 50,
      bellSeed: 1,
    }
    const out = roundTrip(input)
    // setFloatParam uses default precision; we compare with toBeCloseTo, not toBe.
    expect(out.bellAliceAxis![0]).toBeCloseTo(input.bellAliceAxis![0]!, 5)
    expect(out.bellAliceAxis![1]).toBeCloseTo(input.bellAliceAxis![1]!, 5)
    expect(out.bellBobAxis![1]).toBeCloseTo(CANONICAL_CHSH_PHI.b, 5)
    expect(out.bellVisibility).toBeCloseTo(1, 6)
    expect(out.bellDetectionEfficiency).toBeCloseTo(1, 6)
    expect(out.bellAnalysisMode).toBe('fairSampling')
    expect(out.bellSamplerMode).toBe('qm')
    expect(out.bellLhvStrategyId).toBe('deterministicBell')
    expect(out.bellTargetTrials).toBe(10_000)
    expect(out.bellTrialsPerFrame).toBe(50)
    expect(out.bellSeed).toBe(1)
  })

  it('preserves non-default loophole settings', () => {
    const input: BellUrlState = {
      bellVisibility: 0.72,
      bellDetectionEfficiency: 0.83,
      bellAnalysisMode: 'assignNonDetection',
    }
    const out = roundTrip(input)
    expect(out.bellVisibility).toBeCloseTo(0.72, 5)
    expect(out.bellDetectionEfficiency).toBeCloseTo(0.83, 5)
    expect(out.bellAnalysisMode).toBe('assignNonDetection')
  })

  it('preserves precession field vectors', () => {
    const input: BellUrlState = {
      bellFieldA: [0.3, -0.4, 0.7],
      bellFieldB: [-0.1, 0.2, -0.5],
    }
    const out = roundTrip(input)
    expect(out.bellFieldA![0]).toBeCloseTo(0.3, 5)
    expect(out.bellFieldA![1]).toBeCloseTo(-0.4, 5)
    expect(out.bellFieldA![2]).toBeCloseTo(0.7, 5)
    expect(out.bellFieldB![2]).toBeCloseTo(-0.5, 5)
  })

  it('returns empty state when no fields are present', () => {
    const out = roundTrip({})
    expect(Object.keys(out)).toEqual([])
  })

  it('clamps out-of-range visibility to [0, 1]', () => {
    // Direct parse with hand-crafted query string — bypasses serialize clamp.
    const params = new URLSearchParams('bell_v=1.5&bell_eta=-0.3')
    const out: BellUrlState = {}
    deserializeBell(params, out)
    expect(out.bellVisibility).toBeCloseTo(1, 6)
    expect(out.bellDetectionEfficiency).toBeCloseTo(0, 6)
  })

  it('clamps out-of-range trial counts', () => {
    const params = new URLSearchParams('bell_n=99999999999&bell_tpf=999999')
    const out: BellUrlState = {}
    deserializeBell(params, out)
    expect(out.bellTargetTrials).toBe(10_000_000)
    expect(out.bellTrialsPerFrame).toBe(5000)
  })

  it('rejects unknown sampler mode and analysis mode', () => {
    const params = new URLSearchParams('bell_m=quantum&bell_an=foo')
    const out: BellUrlState = {}
    deserializeBell(params, out)
    expect(out.bellSamplerMode).toBeUndefined()
    expect(out.bellAnalysisMode).toBeUndefined()
  })

  it('rejects very long LHV strategy ids', () => {
    const longId = 'a'.repeat(100)
    const params = new URLSearchParams(`bell_lhv=${longId}`)
    const out: BellUrlState = {}
    deserializeBell(params, out)
    expect(out.bellLhvStrategyId).toBeUndefined()
  })
})

describe('Bell URL state — integration with main state-serializer', () => {
  it('round-trips bellPair as the top-level objectType', async () => {
    const { serializeState, deserializeState } = await import('@/lib/url/state-serializer')
    const url = serializeState({
      dimension: 3,
      objectType: 'bellPair',
      bellVisibility: 0.85,
      bellDetectionEfficiency: 0.9,
      bellAnalysisMode: 'fairSampling',
      bellSamplerMode: 'qm',
      bellTargetTrials: 25_000,
    })
    expect(url).toContain('t=bellPair')
    expect(url).toContain('bell_v=')
    expect(url).toContain('bell_eta=')
    expect(url).toContain('bell_n=25000')

    const parsed = deserializeState(url)
    expect(parsed.objectType).toBe('bellPair')
    expect(parsed.bellVisibility).toBeCloseTo(0.85, 5)
    expect(parsed.bellTargetTrials).toBe(25_000)
  })

  it('does not emit bell_* fields when objectType is schroedinger', async () => {
    const { serializeState } = await import('@/lib/url/state-serializer')
    const url = serializeState({
      dimension: 4,
      objectType: 'schroedinger',
      quantumMode: 'harmonicOscillator',
      bellVisibility: 0.5, // present in state but should not serialize
      bellSamplerMode: 'lhv',
    })
    expect(url).not.toContain('bell_v=')
    expect(url).not.toContain('bell_m=')
  })
})
