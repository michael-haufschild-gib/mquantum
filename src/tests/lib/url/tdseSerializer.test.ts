import { describe, expect, it } from 'vitest'

import {
  MAX_DOUBLE_THROAT_SEPARATION,
  MAX_THROAT_RADIUS,
  MIN_TORUS_PERIOD,
} from '@/lib/physics/tdse/metrics/types'
import {
  deserializeTdseFeatures,
  deserializeTdseMetric,
  deserializeTdsePotential,
  deserializeTdseVisualization,
  serializeTdseFeatures,
  serializeTdseMetric,
  serializeTdsePotential,
  type TdseDeserializableTarget,
} from '@/lib/url/tdseSerializer'

describe('TDSE URL serializer', () => {
  it('serializes potential-specific params only for the active potential type', () => {
    const params = new URLSearchParams()

    serializeTdsePotential(params, {
      potentialType: 'free',
      absorberEnabled: false,
      diagnosticsEnabled: true,
      observablesEnabled: false,
      imaginaryTimeEnabled: true,
      customPotentialExpression: 'x*x',
      anharmonicLambda: 7,
      disorderStrength: 9,
      disorderSeed: 123,
      disorderDistribution: 'gaussian',
    })

    expect(params.toString()).toBe('pot=free&abs=0&diag=1&obs=0&it=1')
  })

  it('deserializes custom potential expressions only when pot=custom and length is bounded', () => {
    const accepted: TdseDeserializableTarget = {}
    deserializeTdsePotential(new URLSearchParams(`pot=custom&cpx=${'x'.repeat(200)}`), accepted)

    expect(accepted.potentialType).toBe('custom')
    expect(accepted.customPotentialExpression).toBe('x'.repeat(200))

    const rejected: TdseDeserializableTarget = {}
    deserializeTdsePotential(new URLSearchParams(`pot=custom&cpx=${'x'.repeat(201)}`), rejected)
    expect(rejected.potentialType).toBe('custom')
    expect(rejected.customPotentialExpression).toBeUndefined()

    const ignored: TdseDeserializableTarget = {}
    deserializeTdsePotential(new URLSearchParams('pot=free&cpx=x*x'), ignored)
    expect(ignored.customPotentialExpression).toBeUndefined()
  })

  it('parses Anderson disorder extras only under andersonDisorder potential', () => {
    const accepted: TdseDeserializableTarget = {}
    deserializeTdsePotential(
      new URLSearchParams('pot=andersonDisorder&dis_w=999&dis_s=9999999&dis_d=gaussian'),
      accepted
    )

    expect(accepted.disorderStrength).toBe(100)
    expect(accepted.disorderSeed).toBe(999999)
    expect(accepted.disorderDistribution).toBe('gaussian')

    const ignored: TdseDeserializableTarget = {}
    deserializeTdsePotential(new URLSearchParams('pot=free&dis_w=8&dis_s=7&dis_d=uniform'), ignored)
    expect(ignored.disorderStrength).toBeUndefined()
    expect(ignored.disorderSeed).toBeUndefined()
    expect(ignored.disorderDistribution).toBeUndefined()
  })

  it('round-trips black-hole Regge-Wheeler extras only under blackHoleRingdown', () => {
    const params = new URLSearchParams()
    serializeTdsePotential(params, {
      potentialType: 'blackHoleRingdown',
      bhMass: 1.25,
      bhMultipoleL: 3,
      bhSpin: 2,
      disorderStrength: 9,
    })

    expect(params.toString()).toBe('pot=blackHoleRingdown&bh_m=1.250&bh_l=3&bh_s=2')

    const accepted: TdseDeserializableTarget = {}
    deserializeTdsePotential(new URLSearchParams(params), accepted)
    expect(accepted.potentialType).toBe('blackHoleRingdown')
    expect(accepted.bhMass).toBeCloseTo(1.25, 3)
    expect(accepted.bhMultipoleL).toBe(3)
    expect(accepted.bhSpin).toBe(2)
    expect(accepted.disorderStrength).toBeUndefined()

    const normalized: TdseDeserializableTarget = {}
    deserializeTdsePotential(
      new URLSearchParams('pot=blackHoleRingdown&bh_m=999&bh_l=0&bh_s=2'),
      normalized
    )
    expect(normalized.bhMass).toBe(5)
    expect(normalized.bhSpin).toBe(2)
    expect(normalized.bhMultipoleL).toBe(2)

    const ignored: TdseDeserializableTarget = {}
    deserializeTdsePotential(new URLSearchParams('pot=free&bh_m=1.25&bh_l=3&bh_s=2'), ignored)
    expect(ignored.bhMass).toBeUndefined()
    expect(ignored.bhMultipoleL).toBeUndefined()
    expect(ignored.bhSpin).toBeUndefined()
  })

  it('serializes flat metric without stale metric sub-params', () => {
    const params = new URLSearchParams()

    serializeTdseMetric(params, {
      tdseMetricKind: 'flat',
      tdseMetricThroatRadius: 1.25,
      tdseSchwarzschildMass: 3,
      tdseHubbleRate: 4,
      tdseAdsRadius: 5,
      tdseTorusPeriod0: 6,
      tdseDoubleThroatSeparation: 7,
    })

    expect(params.toString()).toBe('tdse_metric=flat')
  })

  it('deserializes metric sub-params with the same clamps as store setters', () => {
    const torus: TdseDeserializableTarget = {}
    deserializeTdseMetric(
      new URLSearchParams('tdse_metric=torus&tdse_tp0=0&tdse_tp1=5&tdse_tp2=999'),
      torus
    )
    expect(torus.tdseMetricKind).toBe('torus')
    expect(torus.tdseTorusPeriod0).toBe(MIN_TORUS_PERIOD)
    expect(torus.tdseTorusPeriod1).toBe(5)
    expect(torus.tdseTorusPeriod2).toBeGreaterThan(torus.tdseTorusPeriod1!)

    const doubleThroat: TdseDeserializableTarget = {}
    deserializeTdseMetric(
      new URLSearchParams('tdse_metric=doubleThroat&tdse_dts=999&tdse_dtb=999'),
      doubleThroat
    )
    expect(doubleThroat.tdseDoubleThroatSeparation).toBe(MAX_DOUBLE_THROAT_SEPARATION)
    expect(doubleThroat.tdseDoubleThroatRadius).toBe(MAX_THROAT_RADIUS)
  })

  it('leaves existing metric state untouched when metric kind is unknown', () => {
    const state: TdseDeserializableTarget = {
      tdseMetricKind: 'sphere2D',
      tdseSphereRadius: 2,
    }

    deserializeTdseMetric(new URLSearchParams('tdse_metric=wormhole&tdse_sr=10'), state)

    expect(state).toEqual({ tdseMetricKind: 'sphere2D', tdseSphereRadius: 2 })
  })

  it('parses visualization flags independently of metric kind', () => {
    const state: TdseDeserializableTarget = {}

    deserializeTdseVisualization(
      new URLSearchParams('tdse_co=1&tdse_co_op=2&tdse_dv=proper'),
      state
    )

    expect(state.tdseShowCurvatureOverlay).toBe(true)
    expect(state.tdseCurvatureOverlayOpacity).toBe(1)
    expect(state.tdseDensityView).toBe('proper')
  })

  it('serializes and deserializes feature toggles without leaking disabled sub-params', () => {
    const params = new URLSearchParams()
    serializeTdseFeatures(params, {
      openQuantumEnabled: false,
      openQuantumDephasingRate: 5,
      stochasticEnabled: false,
      stochasticGamma: 6,
      branchingEnabled: true,
      branchPlanePosition: 0,
      wormholeCouplingEnabled: true,
      wormholeCouplingG: 0,
      wormholeMirrorAxis: 2,
      entanglementEnabled: false,
      entanglementPairwiseMI: true,
      entanglementBipartitions: false,
    })

    expect(params.toString()).toBe('brc=1&tdse_wh=1&tdse_whax=2&ent=0&ent_mi=1&ent_bi=0')

    const parsed: TdseDeserializableTarget = {}
    deserializeTdseFeatures(new URLSearchParams('brc=1&brc_p=-5&tdse_wh=1&tdse_whax=9'), parsed)
    expect(parsed.branchingEnabled).toBe(true)
    expect(parsed.branchPlanePosition).toBe(-1)
    expect(parsed.wormholeCouplingEnabled).toBe(true)
    expect(parsed.wormholeMirrorAxis).toBe(2)
  })

  it('serializes and deserializes extended open-quantum params when enabled', () => {
    const params = new URLSearchParams()
    serializeTdseFeatures(params, {
      openQuantumEnabled: true,
      openQuantumDephasingRate: 0.5,
      openQuantumRelaxationRate: 1.2,
      openQuantumThermalUpRate: 0.4,
      openQuantumDephasingEnabled: false,
      openQuantumRelaxationEnabled: true,
      openQuantumThermalEnabled: true,
      openQuantumDt: 0.025,
      openQuantumSubsteps: 7,
      openQuantumBathTemperature: 420,
      openQuantumCouplingScale: 2.25,
      openQuantumHydrogenBasisMaxN: 3,
      openQuantumDephasingModel: 'none',
      openQuantumVisualizationMode: 'entropyMap',
    })

    expect(params.get('oq')).toBe('1')
    expect(params.get('oq_de')).toBe('0')
    expect(params.get('oq_re')).toBe('1')
    expect(params.get('oq_te')).toBe('1')
    expect(params.get('oq_dt')).toBe('0.0250')
    expect(params.get('oq_sub')).toBe('7')
    expect(params.get('oq_tmp')).toBe('420.00')
    expect(params.get('oq_cpl')).toBe('2.2500')
    expect(params.get('oq_nmax')).toBe('3')
    expect(params.get('oq_dm')).toBe('none')
    expect(params.get('oq_viz')).toBe('entropyMap')

    const parsed: TdseDeserializableTarget = {}
    deserializeTdseFeatures(params, parsed)
    expect(parsed.openQuantumEnabled).toBe(true)
    expect(parsed.openQuantumDephasingEnabled).toBe(false)
    expect(parsed.openQuantumRelaxationEnabled).toBe(true)
    expect(parsed.openQuantumThermalEnabled).toBe(true)
    expect(parsed.openQuantumDt).toBeCloseTo(0.025)
    expect(parsed.openQuantumSubsteps).toBe(7)
    expect(parsed.openQuantumBathTemperature).toBeCloseTo(420)
    expect(parsed.openQuantumCouplingScale).toBeCloseTo(2.25)
    expect(parsed.openQuantumHydrogenBasisMaxN).toBe(3)
    expect(parsed.openQuantumDephasingModel).toBe('none')
    expect(parsed.openQuantumVisualizationMode).toBe('entropyMap')
  })
})
