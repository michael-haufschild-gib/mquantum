/**
 * TDSE-specific URL params: curved-space metric, potential-type extras,
 * and the open-quantum / stochastic / branching / wormhole / entanglement
 * feature toggles.
 *
 * Extracted from `./state-serializer.ts`. Owns the `tdse_*`, `oq_*`,
 * `sloc*`, `brc*`, `ent*`, and `dis_*` / `cpx` / `anh_l` URL families.
 *
 * @module lib/url/tdseSerializer
 */

import type { TdsePotentialType } from '@/lib/geometry/extended/tdse'
import {
  MAX_ADS_RADIUS,
  MAX_DOUBLE_THROAT_SEPARATION,
  MAX_HUBBLE_RATE,
  MAX_SCHWARZSCHILD_MASS,
  MAX_SPHERE_RADIUS,
  MAX_THROAT_RADIUS,
  MAX_TORUS_PERIOD,
  type MetricKind,
  MIN_ADS_RADIUS,
  MIN_DOUBLE_THROAT_SEPARATION,
  MIN_HUBBLE_RATE,
  MIN_SCHWARZSCHILD_MASS,
  MIN_SPHERE_RADIUS,
  MIN_THROAT_RADIUS,
  MIN_TORUS_PERIOD,
} from '@/lib/physics/tdse/metrics/types'

import {
  parseBoolParam,
  parseEnumParam,
  parseFloatParam,
  parseIntParam,
  setBoolParam,
  setFloatParam,
  setIntParam,
  setStringParam,
} from './paramHelpers'

const VALID_METRIC_KINDS = [
  'flat',
  'morrisThorne',
  'schwarzschild',
  'deSitter',
  'antiDeSitter',
  'sphere2D',
  'torus',
  'doubleThroat',
] as const satisfies readonly MetricKind[]
type UrlMetricKind = (typeof VALID_METRIC_KINDS)[number]

const VALID_DENSITY_VIEWS = ['coordinate', 'proper'] as const
type UrlDensityView = (typeof VALID_DENSITY_VIEWS)[number]

export const VALID_POTENTIAL_TYPES: TdsePotentialType[] = [
  'free',
  'barrier',
  'step',
  'finiteWell',
  'harmonicTrap',
  'driven',
  'doubleSlit',
  'periodicLattice',
  'doubleWell',
  'becTrap',
  'radialDoubleWell',
  'custom',
  'andersonDisorder',
  'coupledAnharmonic',
]

/**
 * Subset of `ShareableObjectState` consumed by the TDSE serializer.
 * Declared structurally so neither this module nor the orchestrator
 * needs to import the other for the types alone.
 */
export interface TdseSerializableState {
  potentialType?: TdsePotentialType
  absorberEnabled?: boolean
  diagnosticsEnabled?: boolean
  observablesEnabled?: boolean
  imaginaryTimeEnabled?: boolean
  customPotentialExpression?: string
  anharmonicLambda?: number
  disorderStrength?: number
  disorderSeed?: number
  disorderDistribution?: string
  tdseMetricKind?: MetricKind
  tdseMetricThroatRadius?: number
  tdseSchwarzschildMass?: number
  tdseHubbleRate?: number
  tdseAdsRadius?: number
  tdseSphereRadius?: number
  tdseTorusPeriod0?: number
  tdseTorusPeriod1?: number
  tdseTorusPeriod2?: number
  tdseDoubleThroatSeparation?: number
  tdseDoubleThroatRadius?: number
  tdseShowCurvatureOverlay?: boolean
  tdseCurvatureOverlayOpacity?: number
  tdseDensityView?: 'coordinate' | 'proper'
  openQuantumEnabled?: boolean
  openQuantumDephasingRate?: number
  openQuantumRelaxationRate?: number
  openQuantumThermalUpRate?: number
  stochasticEnabled?: boolean
  stochasticGamma?: number
  stochasticSigma?: number
  stochasticNumSites?: number
  branchingEnabled?: boolean
  branchPlanePosition?: number
  wormholeCouplingEnabled?: boolean
  wormholeCouplingG?: number
  wormholeMirrorAxis?: 0 | 1 | 2
  entanglementEnabled?: boolean
  entanglementPairwiseMI?: boolean
  entanglementBipartitions?: boolean
}

/**
 * Mutable target type for TDSE deserialization. Identical shape to
 * `TdseSerializableState` but with each property writable so the
 * accumulator object the deserializer fills in passes type-checking.
 */
export type TdseDeserializableTarget = {
  -readonly [K in keyof TdseSerializableState]: TdseSerializableState[K]
}

// ── Serialize ───────────────────────────────────────────────────────────────

/**
 * Emit the TDSE potential-type, its sub-params, and the curved-space
 * metric block. Skips silently when fields are undefined.
 */
export function serializeTdsePotential(
  params: URLSearchParams,
  state: TdseSerializableState
): void {
  setStringParam(params, 'pot', state.potentialType)
  setBoolParam(params, 'abs', state.absorberEnabled)
  setBoolParam(params, 'diag', state.diagnosticsEnabled)
  setBoolParam(params, 'obs', state.observablesEnabled)
  setBoolParam(params, 'it', state.imaginaryTimeEnabled)
  if (state.potentialType === 'custom' && state.customPotentialExpression) {
    setStringParam(params, 'cpx', state.customPotentialExpression)
  }
  if (state.potentialType === 'coupledAnharmonic') {
    setFloatParam(params, 'anh_l', state.anharmonicLambda, true)
  }
  if (state.potentialType === 'andersonDisorder') {
    setFloatParam(params, 'dis_w', state.disorderStrength, true)
    setIntParam(params, 'dis_s', state.disorderSeed)
    setStringParam(params, 'dis_d', state.disorderDistribution)
  }
}

/**
 * Emit the curved-space TDSE metric sub-block.
 *
 * `tdse_metric` emits unconditionally when the kind is set (including
 * `flat` — explicit flat distinguishes "user chose flat" from "no
 * opinion"). Sub-params only ride along for the kinds that need them;
 * emitting them under flat would be confusing and the deserializer
 * would ignore them.
 */
export function serializeTdseMetric(params: URLSearchParams, state: TdseSerializableState): void {
  if (state.tdseMetricKind === undefined) return
  setStringParam(params, 'tdse_metric', state.tdseMetricKind)
  switch (state.tdseMetricKind) {
    case 'flat':
      return
    case 'morrisThorne':
      setFloatParam(params, 'tdse_b0', state.tdseMetricThroatRadius, false, 4)
      return
    case 'schwarzschild':
      setFloatParam(params, 'tdse_sm', state.tdseSchwarzschildMass, false, 4)
      return
    case 'deSitter':
      setFloatParam(params, 'tdse_h', state.tdseHubbleRate, false, 4)
      return
    case 'antiDeSitter':
      setFloatParam(params, 'tdse_ads', state.tdseAdsRadius, false, 4)
      return
    case 'sphere2D':
      setFloatParam(params, 'tdse_sr', state.tdseSphereRadius, false, 4)
      return
    case 'torus':
      setFloatParam(params, 'tdse_tp0', state.tdseTorusPeriod0, false, 4)
      setFloatParam(params, 'tdse_tp1', state.tdseTorusPeriod1, false, 4)
      setFloatParam(params, 'tdse_tp2', state.tdseTorusPeriod2, false, 4)
      return
    case 'doubleThroat':
      setFloatParam(params, 'tdse_dts', state.tdseDoubleThroatSeparation, false, 4)
      setFloatParam(params, 'tdse_dtb', state.tdseDoubleThroatRadius, false, 4)
      return
  }
}

/**
 * Emit the curved-space TDSE visualization flags. Independent of metric
 * kind so a user can pin a coordinate/proper preference that survives
 * metric swaps in the URL.
 */
export function serializeTdseVisualization(
  params: URLSearchParams,
  state: TdseSerializableState
): void {
  setBoolParam(params, 'tdse_co', state.tdseShowCurvatureOverlay)
  setFloatParam(params, 'tdse_co_op', state.tdseCurvatureOverlayOpacity, false, 3)
  setStringParam(params, 'tdse_dv', state.tdseDensityView)
}

/**
 * Emit feature toggles: open quantum, stochastic localization, branching
 * visualization, ER=EPR wormhole coupling, coordinate entanglement.
 */
export function serializeTdseFeatures(params: URLSearchParams, state: TdseSerializableState): void {
  if (state.openQuantumEnabled) {
    params.set('oq', '1')
    setFloatParam(params, 'oq_dp', state.openQuantumDephasingRate, true)
    setFloatParam(params, 'oq_rx', state.openQuantumRelaxationRate, true)
    setFloatParam(params, 'oq_th', state.openQuantumThermalUpRate, true)
  }

  if (state.stochasticEnabled) {
    params.set('sloc', '1')
    setFloatParam(params, 'sloc_g', state.stochasticGamma, true)
    setFloatParam(params, 'sloc_s', state.stochasticSigma, true)
    setIntParam(params, 'sloc_n', state.stochasticNumSites)
  }

  // Branching visualization (TDSE diagnostic partition + branch coloring).
  // Independent from `sloc` because the partition diagnostic is meaningful
  // even without stochastic localization (e.g., to measure left/right
  // populations under a static double-well potential).
  if (state.branchingEnabled) {
    params.set('brc', '1')
    setFloatParam(params, 'brc_p', state.branchPlanePosition, true)
  }

  // ER=EPR wormhole coupling. Only emits the sub-params when enabled so
  // a `?tdse_wh=0` link isn't polluted with redundant coupling/axis values.
  if (state.wormholeCouplingEnabled) {
    params.set('tdse_wh', '1')
    setFloatParam(params, 'tdse_whg', state.wormholeCouplingG, true)
    setIntParam(params, 'tdse_whax', state.wormholeMirrorAxis)
  }

  setBoolParam(params, 'ent', state.entanglementEnabled)
  setBoolParam(params, 'ent_mi', state.entanglementPairwiseMI)
  setBoolParam(params, 'ent_bi', state.entanglementBipartitions)
}

// ── Deserialize ─────────────────────────────────────────────────────────────

/** Parse the TDSE potential-type enum + its potential-specific extras. */
export function deserializeTdsePotential(
  params: URLSearchParams,
  state: TdseDeserializableTarget
): void {
  state.potentialType = parseEnumParam(params, 'pot', VALID_POTENTIAL_TYPES)
  state.absorberEnabled = parseBoolParam(params, 'abs')
  state.diagnosticsEnabled = parseBoolParam(params, 'diag')
  state.observablesEnabled = parseBoolParam(params, 'obs')
  state.imaginaryTimeEnabled = parseBoolParam(params, 'it')

  if (state.potentialType === 'custom') {
    const cpx = params.get('cpx')
    if (cpx && cpx.length <= 200) state.customPotentialExpression = cpx
  }
  if (state.potentialType === 'coupledAnharmonic') {
    state.anharmonicLambda = parseFloatParam(params, 'anh_l', 0, 100)
  }
  if (state.potentialType === 'andersonDisorder') {
    state.disorderStrength = parseFloatParam(params, 'dis_w', 0, 100)
    state.disorderSeed = parseIntParam(params, 'dis_s', 0, 999999)
    const dd = params.get('dis_d')
    if (dd === 'uniform' || dd === 'gaussian') state.disorderDistribution = dd
  }
}

/**
 * Parse the `tdse_metric` kind and its kind-specific sub-params. Invalid
 * kinds leave `tdseMetricKind` undefined per the unknown-params policy.
 */
export function deserializeTdseMetric(
  params: URLSearchParams,
  state: TdseDeserializableTarget
): void {
  const metricKind = parseEnumParam<UrlMetricKind>(params, 'tdse_metric', VALID_METRIC_KINDS)
  if (metricKind === undefined) return
  state.tdseMetricKind = metricKind
  switch (metricKind) {
    case 'flat':
      return
    case 'morrisThorne':
      state.tdseMetricThroatRadius = parseFloatParam(
        params,
        'tdse_b0',
        MIN_THROAT_RADIUS,
        MAX_THROAT_RADIUS
      )
      return
    case 'schwarzschild':
      state.tdseSchwarzschildMass = parseFloatParam(
        params,
        'tdse_sm',
        MIN_SCHWARZSCHILD_MASS,
        MAX_SCHWARZSCHILD_MASS
      )
      return
    case 'deSitter':
      state.tdseHubbleRate = parseFloatParam(params, 'tdse_h', MIN_HUBBLE_RATE, MAX_HUBBLE_RATE)
      return
    case 'antiDeSitter':
      state.tdseAdsRadius = parseFloatParam(params, 'tdse_ads', MIN_ADS_RADIUS, MAX_ADS_RADIUS)
      return
    case 'sphere2D':
      state.tdseSphereRadius = parseFloatParam(
        params,
        'tdse_sr',
        MIN_SPHERE_RADIUS,
        MAX_SPHERE_RADIUS
      )
      return
    case 'torus':
      state.tdseTorusPeriod0 = parseFloatParam(
        params,
        'tdse_tp0',
        MIN_TORUS_PERIOD,
        MAX_TORUS_PERIOD
      )
      state.tdseTorusPeriod1 = parseFloatParam(
        params,
        'tdse_tp1',
        MIN_TORUS_PERIOD,
        MAX_TORUS_PERIOD
      )
      state.tdseTorusPeriod2 = parseFloatParam(
        params,
        'tdse_tp2',
        MIN_TORUS_PERIOD,
        MAX_TORUS_PERIOD
      )
      return
    case 'doubleThroat':
      state.tdseDoubleThroatSeparation = parseFloatParam(
        params,
        'tdse_dts',
        MIN_DOUBLE_THROAT_SEPARATION,
        MAX_DOUBLE_THROAT_SEPARATION
      )
      state.tdseDoubleThroatRadius = parseFloatParam(
        params,
        'tdse_dtb',
        MIN_THROAT_RADIUS,
        MAX_THROAT_RADIUS
      )
      return
  }
}

/**
 * Parse curved-space TDSE visualization flags independently of metric
 * kind so the preference survives a metric swap.
 */
export function deserializeTdseVisualization(
  params: URLSearchParams,
  state: TdseDeserializableTarget
): void {
  state.tdseShowCurvatureOverlay = parseBoolParam(params, 'tdse_co')
  state.tdseCurvatureOverlayOpacity = parseFloatParam(params, 'tdse_co_op', 0, 1)
  state.tdseDensityView = parseEnumParam<UrlDensityView>(params, 'tdse_dv', VALID_DENSITY_VIEWS)
}

/** Parse open-quantum, stochastic, branching, wormhole, entanglement params. */
export function deserializeTdseFeatures(
  params: URLSearchParams,
  state: TdseDeserializableTarget
): void {
  const oq = parseBoolParam(params, 'oq')
  if (oq !== undefined) {
    state.openQuantumEnabled = oq
    state.openQuantumDephasingRate = parseFloatParam(params, 'oq_dp', 0, 5)
    state.openQuantumRelaxationRate = parseFloatParam(params, 'oq_rx', 0, 5)
    state.openQuantumThermalUpRate = parseFloatParam(params, 'oq_th', 0, 5)
  }

  const sloc = parseBoolParam(params, 'sloc')
  if (sloc !== undefined) {
    state.stochasticEnabled = sloc
    state.stochasticGamma = parseFloatParam(params, 'sloc_g', 0, 10)
    state.stochasticSigma = parseFloatParam(params, 'sloc_s', 0.5, 5)
    state.stochasticNumSites = parseIntParam(params, 'sloc_n', 1, 32)
  }

  const brc = parseBoolParam(params, 'brc')
  if (brc !== undefined) {
    state.branchingEnabled = brc
    // Matches the store's setTdseBranchPlanePosition clamp [-1, 1].
    state.branchPlanePosition = parseFloatParam(params, 'brc_p', -1, 1)
  }

  const wh = parseBoolParam(params, 'tdse_wh')
  if (wh !== undefined) {
    state.wormholeCouplingEnabled = wh
    state.wormholeCouplingG = parseFloatParam(params, 'tdse_whg', 0, 5)
    const axis = parseIntParam(params, 'tdse_whax', 0, 2)
    if (axis !== undefined) {
      state.wormholeMirrorAxis = axis as 0 | 1 | 2
    }
  }

  state.entanglementEnabled = parseBoolParam(params, 'ent')
  state.entanglementPairwiseMI = parseBoolParam(params, 'ent_mi')
  state.entanglementBipartitions = parseBoolParam(params, 'ent_bi')
}
