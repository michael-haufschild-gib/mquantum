/**
 * Tests for the Wheeler–DeWitt URL sub-block serializer.
 *
 * The WdW serializer has subtle elision rules — the isotropic asymmetry
 * (wdw_ma=1) is dropped from the URL, the cosmological constant Λ=0 is
 * elided, but the inflaton mass m=0 is NOT (because m=0 is the physically
 * distinct free-kinetic regime). A regression that flips one of these
 * rules silently changes which scenario a shared link reproduces — these
 * tests pin every gating condition.
 */

import { describe, expect, it } from 'vitest'

import type { WdwUrlState } from '@/lib/url/wdwSerializer'
import {
  deserializeWdw,
  serializeWdw,
  VALID_WDW_BOUNDARY_CONDITIONS,
} from '@/lib/url/wdwSerializer'

function roundTrip(input: WdwUrlState): WdwUrlState {
  const params = new URLSearchParams()
  serializeWdw(params, input)
  const out: WdwUrlState = {}
  deserializeWdw(params, out)
  return out
}

describe('serializeWdw — wire format', () => {
  it('emits boundary condition string verbatim', () => {
    for (const bc of VALID_WDW_BOUNDARY_CONDITIONS) {
      const params = new URLSearchParams()
      serializeWdw(params, { wdwBoundaryCondition: bc })
      expect(params.get('wdw_bc')).toBe(bc)
    }
  })

  it('emits wdw_m even when value is 0 (zero is physically meaningful = free-kinetic regime)', () => {
    const params = new URLSearchParams()
    serializeWdw(params, { wdwInflatonMass: 0 })
    // Regression guard from comments: previously omitZero=true silently
    // dropped m=0, restoring URLs as the default m=0.3 on reload.
    expect(params.get('wdw_m')).toBe('0.00')
  })

  it('emits wdw_prs even when value is 0 (zero disables phase rotation, not the default)', () => {
    const params = new URLSearchParams()
    serializeWdw(params, { wdwPhaseRotationSpeed: 0 })
    expect(params.get('wdw_prs')).toBe('0.00')
  })

  it('elides wdw_ma when value equals 1 (isotropic default)', () => {
    const params = new URLSearchParams()
    serializeWdw(params, { wdwInflatonMassAsymmetry: 1 })
    expect(params.has('wdw_ma')).toBe(false)
  })

  it('emits wdw_ma when value differs from 1 (asymmetric scenario)', () => {
    const params = new URLSearchParams()
    serializeWdw(params, { wdwInflatonMassAsymmetry: 2.5 })
    expect(params.get('wdw_ma')).toBe('2.5000')
  })

  it('elides wdw_lambda=0 (default cosmological constant)', () => {
    const params = new URLSearchParams()
    serializeWdw(params, { wdwCosmologicalConstant: 0 })
    expect(params.has('wdw_lambda')).toBe(false)
  })

  it('emits negative wdw_lambda', () => {
    const params = new URLSearchParams()
    serializeWdw(params, { wdwCosmologicalConstant: -0.5 })
    expect(params.get('wdw_lambda')).toBe('-0.50')
  })

  it('elides wdw_dr when value is 100 (default headroom)', () => {
    const params = new URLSearchParams()
    serializeWdw(params, { wdwRenderDynamicRange: 100 })
    expect(params.has('wdw_dr')).toBe(false)
  })

  it('emits wdw_dr when value differs from 100', () => {
    const params = new URLSearchParams()
    serializeWdw(params, { wdwRenderDynamicRange: 250 })
    expect(params.get('wdw_dr')).toBe('250.000')
  })

  it('emits all integer params as decimal strings', () => {
    const params = new URLSearchParams()
    serializeWdw(params, {
      wdwGridNa: 128,
      wdwGridNphi: 32,
      wdwStreamlineDensity: 8,
    })
    expect(params.get('wdw_gn_a')).toBe('128')
    expect(params.get('wdw_gn_p')).toBe('32')
    expect(params.get('wdw_sld')).toBe('8')
  })

  it('emits all booleans as 1/0', () => {
    const params = new URLSearchParams()
    serializeWdw(params, {
      wdwStreamlinesEnabled: true,
      wdwPhaseRotationEnabled: false,
      wdwWorldlineEnabled: true,
    })
    expect(params.get('wdw_sl')).toBe('1')
    expect(params.get('wdw_pr')).toBe('0')
    expect(params.get('wdw_wl')).toBe('1')
  })

  it('emits worldline pulse width with 4-decimal precision', () => {
    const params = new URLSearchParams()
    serializeWdw(params, { wdwWorldlinePulseWidth: 0.123456 })
    expect(params.get('wdw_wlw')).toBe('0.1235')
  })

  it('elides wdw_wls when value is 0 (omitZero rule)', () => {
    const params = new URLSearchParams()
    serializeWdw(params, { wdwWorldlineSpeed: 0 })
    expect(params.has('wdw_wls')).toBe(false)
  })

  it('elides wdw_wlw when value is 0', () => {
    const params = new URLSearchParams()
    serializeWdw(params, { wdwWorldlinePulseWidth: 0 })
    expect(params.has('wdw_wlw')).toBe(false)
  })
})

describe('deserializeWdw — validation', () => {
  it('accepts only enumerated boundary conditions', () => {
    const valid: WdwUrlState = {}
    deserializeWdw(new URLSearchParams('wdw_bc=tunneling'), valid)
    expect(valid.wdwBoundaryCondition).toBe('tunneling')

    const invalid: WdwUrlState = {}
    deserializeWdw(new URLSearchParams('wdw_bc=invented'), invalid)
    expect(invalid.wdwBoundaryCondition).toBeUndefined()
  })

  it('clamps wdw_m into [0, 2]', () => {
    const out: WdwUrlState = {}
    deserializeWdw(new URLSearchParams('wdw_m=-1'), out)
    expect(out.wdwInflatonMass).toBe(0)

    const out2: WdwUrlState = {}
    deserializeWdw(new URLSearchParams('wdw_m=99'), out2)
    expect(out2.wdwInflatonMass).toBe(2)
  })

  it('clamps wdw_ma into [0.1, 10]', () => {
    const out: WdwUrlState = {}
    deserializeWdw(new URLSearchParams('wdw_ma=0.001'), out)
    expect(out.wdwInflatonMassAsymmetry).toBe(0.1)

    const out2: WdwUrlState = {}
    deserializeWdw(new URLSearchParams('wdw_ma=999'), out2)
    expect(out2.wdwInflatonMassAsymmetry).toBe(10)
  })

  it('clamps wdw_lambda into [-1, 1]', () => {
    const out: WdwUrlState = {}
    deserializeWdw(new URLSearchParams('wdw_lambda=-99'), out)
    expect(out.wdwCosmologicalConstant).toBe(-1)

    const out2: WdwUrlState = {}
    deserializeWdw(new URLSearchParams('wdw_lambda=99'), out2)
    expect(out2.wdwCosmologicalConstant).toBe(1)
  })

  it('clamps grid Na into [16, 1024]', () => {
    const out: WdwUrlState = {}
    deserializeWdw(new URLSearchParams('wdw_gn_a=1'), out)
    expect(out.wdwGridNa).toBe(16)
    deserializeWdw(new URLSearchParams('wdw_gn_a=99999'), out)
    expect(out.wdwGridNa).toBe(1024)
  })

  it('clamps grid Nphi into [8, 128]', () => {
    const out: WdwUrlState = {}
    deserializeWdw(new URLSearchParams('wdw_gn_p=1'), out)
    expect(out.wdwGridNphi).toBe(8)
    deserializeWdw(new URLSearchParams('wdw_gn_p=99999'), out)
    expect(out.wdwGridNphi).toBe(128)
  })

  it('clamps streamline density into [2, 16]', () => {
    const out: WdwUrlState = {}
    deserializeWdw(new URLSearchParams('wdw_sld=1'), out)
    expect(out.wdwStreamlineDensity).toBe(2)
    deserializeWdw(new URLSearchParams('wdw_sld=99'), out)
    expect(out.wdwStreamlineDensity).toBe(16)
  })

  it('rejects malformed integers and floats', () => {
    const out: WdwUrlState = {}
    deserializeWdw(new URLSearchParams('wdw_gn_a=abc&wdw_m=xyz'), out)
    expect(out.wdwGridNa).toBeUndefined()
    expect(out.wdwInflatonMass).toBeUndefined()
  })

  it('accepts scientific notation for floats but not integers', () => {
    const outFloat: WdwUrlState = {}
    deserializeWdw(new URLSearchParams('wdw_m=1e0'), outFloat)
    // FLOAT_RE supports scientific notation; should clamp into range.
    expect(outFloat.wdwInflatonMass).toBe(1)

    const outInt: WdwUrlState = {}
    deserializeWdw(new URLSearchParams('wdw_gn_a=1e2'), outInt)
    // INTEGER_RE rejects scientific notation.
    expect(outInt.wdwGridNa).toBeUndefined()
  })

  it('clamps render dynamic range into [1, 10000]', () => {
    const out: WdwUrlState = {}
    deserializeWdw(new URLSearchParams('wdw_dr=0.5'), out)
    expect(out.wdwRenderDynamicRange).toBe(1)
    deserializeWdw(new URLSearchParams('wdw_dr=99999'), out)
    expect(out.wdwRenderDynamicRange).toBe(10_000)
  })
})

describe('round-trip — full state', () => {
  it('preserves a fully populated state across serialize → deserialize', () => {
    const input: WdwUrlState = {
      wdwBoundaryCondition: 'noBoundary',
      wdwInflatonMass: 1.23,
      wdwInflatonMassAsymmetry: 2.5,
      wdwCosmologicalConstant: -0.42,
      wdwGridNa: 256,
      wdwGridNphi: 64,
      wdwStreamlinesEnabled: true,
      wdwStreamlineDensity: 8,
      wdwPhaseRotationEnabled: true,
      wdwPhaseRotationSpeed: 1.5,
      wdwWorldlineEnabled: true,
      wdwWorldlineSpeed: 1.2,
      wdwWorldlinePulseWidth: 0.15,
      wdwRenderDynamicRange: 500,
    }
    const out = roundTrip(input)
    expect(out.wdwBoundaryCondition).toBe('noBoundary')
    expect(out.wdwInflatonMass).toBeCloseTo(1.23, 2)
    expect(out.wdwInflatonMassAsymmetry).toBeCloseTo(2.5, 4)
    expect(out.wdwCosmologicalConstant).toBeCloseTo(-0.42, 2)
    expect(out.wdwGridNa).toBe(256)
    expect(out.wdwGridNphi).toBe(64)
    expect(out.wdwStreamlinesEnabled).toBe(true)
    expect(out.wdwStreamlineDensity).toBe(8)
    expect(out.wdwPhaseRotationEnabled).toBe(true)
    expect(out.wdwPhaseRotationSpeed).toBeCloseTo(1.5, 2)
    expect(out.wdwWorldlineEnabled).toBe(true)
    expect(out.wdwWorldlineSpeed).toBeCloseTo(1.2, 2)
    expect(out.wdwWorldlinePulseWidth).toBeCloseTo(0.15, 4)
    expect(out.wdwRenderDynamicRange).toBeCloseTo(500, 3)
  })

  it('m=0 round-trips as 0 (regression: previously absorbed into default m=0.3)', () => {
    const out = roundTrip({ wdwInflatonMass: 0 })
    expect(out.wdwInflatonMass).toBe(0)
  })

  it('asymmetry α=1 round-trips as undefined (default elision)', () => {
    const out = roundTrip({ wdwInflatonMassAsymmetry: 1 })
    expect(out.wdwInflatonMassAsymmetry).toBeUndefined()
  })

  it('Λ=0 round-trips as undefined (default elision)', () => {
    const out = roundTrip({ wdwCosmologicalConstant: 0 })
    expect(out.wdwCosmologicalConstant).toBeUndefined()
  })

  it('renderDynamicRange=100 round-trips as undefined (default elision)', () => {
    const out = roundTrip({ wdwRenderDynamicRange: 100 })
    expect(out.wdwRenderDynamicRange).toBeUndefined()
  })

  it('serializeWdw is a no-op on an empty state', () => {
    const params = new URLSearchParams()
    serializeWdw(params, {})
    expect([...params.keys()]).toEqual([])
  })

  it('phase-rotation speed=0 round-trips as 0 (regression: must NOT be elided)', () => {
    const out = roundTrip({ wdwPhaseRotationSpeed: 0 })
    expect(out.wdwPhaseRotationSpeed).toBe(0)
  })
})
