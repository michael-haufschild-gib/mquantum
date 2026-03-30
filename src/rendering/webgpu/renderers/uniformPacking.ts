/**
 * Pure uniform-packing functions for the Schrodinger renderer.
 *
 * Every function in this module writes pre-computed values into typed arrays
 * at byte offsets derived from the declarative struct layout in
 * `schroedingerLayout.ts`. No GPU resources, no class state, no store access.
 * The renderer orchestrates store reads, dirty checks, and buffer uploads;
 * this module only does the packing.
 *
 * @module rendering/webgpu/renderers/uniformPacking
 */

import type { SchroedingerConfig } from '@/lib/geometry/extended/types'
import { computeRadialProbabilityNorm } from '@/lib/math/hydrogenRadialProbability'
import type { AppearanceStoreState } from '@/stores/appearanceStore'
import type { PBRSliceState } from '@/stores/slices/visual/pbrSlice'

import { MAX_DIM, MAX_EXTRA_DIM, MAX_TERMS } from '../shaders/schroedinger/uniforms.wgsl'
import { parseHexColorToLinearRgb } from '../utils/color'
import { zeroReservedFields } from '../utils/structLayout'
import { packClassicalOverlay } from './uniformPackingClassical'

export { projectNDToModelSpace } from './uniformPackingClassical'
import {
  CROSS_SECTION_COMPOSITE_MODE_MAP,
  CROSS_SECTION_SCALAR_MAP,
  MOMENTUM_DISPLAY_MODE_MAP,
  NODAL_DEFINITION_MAP,
  NODAL_FAMILY_MAP,
  NODAL_RENDER_MODE_MAP,
  PROBABILITY_CURRENT_COLOR_MODE_MAP,
  PROBABILITY_CURRENT_PLACEMENT_MAP,
  PROBABILITY_CURRENT_STYLE_MAP,
  REPRESENTATION_MODE_MAP,
} from './schrodingerRendererTypes'
import { SCHROEDINGER_LAYOUT } from './schroedingerLayout'

// Field name → float32/int32 index (byte offset / 4)
const I = SCHROEDINGER_LAYOUT.index

// ---------------------------------------------------------------------------
// Shared helper
// ---------------------------------------------------------------------------

function parseColor(hex: string): [number, number, number] {
  const rgb = parseHexColorToLinearRgb(hex, [1, 1, 1])
  return [rgb[0], rgb[1], rgb[2]]
}

// =========================================================================
// Schroedinger uniform buffer
// =========================================================================

/** Flattened preset arrays as produced by `flattenPresetForUniforms`. */
export interface FlattenedPreset {
  omega: Float32Array
  quantum: Int32Array
  coeff: Float32Array
  energy: Float32Array
}

/** Observables position history for TDSE/BEC Ehrenfest trail. */
export interface ObservablesTrailData {
  /** Per-dimension ⟨x_i⟩(t) ring buffer */
  historyPositionMean: Float64Array[]
  /** Current write head */
  historyHead: number
  /** Number of valid entries */
  historyCount: number
  /** Number of active dimensions */
  activeDims: number
}

/** All values needed to pack the Schroedinger uniform buffer. */
export interface SchroedingerPackParams {
  // Mode classification
  quantumModeInt: number
  quantumModeStr: string
  isUniformComputeMode: boolean
  isDensityMatrixMode: boolean
  dimension: number

  // Preset data
  presetTermCount: number
  presetData: FlattenedPreset | null

  // Renderer state
  boundingRadius: number
  canonicalDensityCompensation: number
  cachedPeakDensity: number
  colorAlgorithm: number
  effectiveSampleCount: number
  effectiveMomentumScale: number
  hbar: number
  animationTime: number
  uncertaintyLogRhoThreshold: number
  uncertaintyConfidenceMass: number
  uncertaintyBoundaryWidth: number

  // Store snapshots (accessed for individual field reads)
  schroedinger: Partial<SchroedingerConfig> | undefined
  appearance: AppearanceStoreState | undefined
  pbr: PBRSliceState | undefined
  pauliSpinor: { spinUpColor?: number[]; spinDownColor?: number[] } | undefined

  // Renderer config subset
  rendererOpenQuantumEnabled: boolean
  rendererQuantumMode: string
  rendererTermCount: number | undefined

  // A3 observables position history for TDSE/BEC Ehrenfest trail
  observablesTrailData: ObservablesTrailData | null
}

/**
 * Pack all Schroedinger uniform values into the pre-allocated typed-array views.
 *
 * Byte offsets are derived from the declarative struct layout, which mirrors
 * the WGSL `SchroedingerUniforms` struct and is validated by tests.
 */
export function packSchroedingerUniforms(
  floatView: Float32Array,
  intView: Int32Array,
  p: SchroedingerPackParams
): void {
  // Zero all reserved and padding fields in one declarative pass
  zeroReservedFields(floatView, SCHROEDINGER_LAYOUT)

  intView[I.quantumMode] = p.quantumModeInt
  intView[I.termCount] = p.presetTermCount

  packQuantumArrays(floatView, intView, p)
  const hydrogenResult = packHydrogenAndExtraDims(floatView, intView, p)
  packVisualFields(floatView, intView, p)
  packNodalAndColorSystem(floatView, intView, p)
  packOverlayControls(floatView, intView, p)
  packCrossSectionAndCurrent(floatView, intView, p)
  packRepresentationAndColorOverlays(floatView, intView, p, hydrogenResult)
  packWignerAndPauliFields(floatView, intView, p)
}

// ---------------------------------------------------------------------------
// Sub-packers — each handles a contiguous block of fields
// ---------------------------------------------------------------------------

/** Result from hydrogen packing needed by downstream sub-packers. */
interface HydrogenResult {
  validN: number
  validL: number
  bohrRadius: number
}

/** Pack omega, quantum, coeff, energy arrays. */
function packQuantumArrays(
  floatView: Float32Array,
  intView: Int32Array,
  p: SchroedingerPackParams
): void {
  const { presetData } = p

  // omega: 3 vec4f = 12 floats, use 11
  for (let i = 0; i < MAX_DIM; i++) {
    floatView[I.omega + i] = presetData?.omega[i] ?? 1.0
  }
  floatView[I.omega + 11] = 0.0

  // quantum: 22 vec4i = 88 ints
  for (let i = 0; i < MAX_TERMS * MAX_DIM; i++) {
    intView[I.quantum + i] = presetData?.quantum[i] ?? 0
  }

  // coeff: 8 vec4f, xy = complex value, zw = padding
  for (let i = 0; i < MAX_TERMS; i++) {
    const baseIdx = I.coeff + i * 4
    floatView[baseIdx] = presetData?.coeff[i * 2] ?? (i === 0 ? 1.0 : 0.0)
    floatView[baseIdx + 1] = presetData?.coeff[i * 2 + 1] ?? 0.0
    floatView[baseIdx + 2] = 0.0
    floatView[baseIdx + 3] = 0.0
  }

  // energy: 2 vec4f = 8 floats
  for (let i = 0; i < MAX_TERMS; i++) {
    floatView[I.energy + i] = presetData?.energy[i] ?? 0.5
  }
}

/** Pack hydrogen quantum numbers, boosts, and extra-dimension arrays. */
function packHydrogenAndExtraDims(
  floatView: Float32Array,
  intView: Int32Array,
  p: SchroedingerPackParams
): HydrogenResult {
  const { schroedinger, dimension } = p

  const principalN = schroedinger?.principalQuantumNumber ?? 2
  const azimuthalL = schroedinger?.azimuthalQuantumNumber ?? 1
  const magneticM = schroedinger?.magneticQuantumNumber ?? 0
  const bohrRadius = schroedinger?.bohrRadiusScale ?? 1.0

  const validN = Math.max(1, principalN)
  const validL = Math.max(0, Math.min(azimuthalL, validN - 1))
  const validM = Math.max(-validL, Math.min(magneticM, validL))

  intView[I.principalN] = validN
  intView[I.azimuthalL] = validL
  intView[I.magneticM] = validM
  floatView[I.bohrRadius] = bohrRadius
  intView[I.useRealOrbitals] = schroedinger?.useRealOrbitals ? 1 : 0

  // hydrogenBoost = 50 * n^2 * 3^l
  const lBoost = Math.pow(3.0, validL)
  const hydrogenBoost = 50.0 * validN * validN * lBoost
  floatView[I.hydrogenBoost] = hydrogenBoost

  // hydrogenNDBoost: compensate for HO normalization in extra dimensions
  const numExtraDims = Math.max(0, dimension - 3)
  let normCompensation = 1.0
  for (let i = 0; i < numExtraDims; i++) {
    const baseOmega = (schroedinger?.extraDimOmega as number[] | undefined)?.[i] ?? 1.0
    const spread = 1.0 + (i - 3.5) * (schroedinger?.extraDimFrequencySpread ?? 0)
    const effectiveOmega = Math.max(baseOmega * spread, 0.01)
    normCompensation *= Math.sqrt(Math.PI / effectiveOmega)
  }
  floatView[I.hydrogenNDBoost] = hydrogenBoost * normCompensation

  // hydrogenRadialThreshold — uses D-dimensional n_eff = n + (D-3)/2
  const hydrogenFieldScale = schroedinger?.fieldScale ?? 1.0
  const nEff = validN + (dimension - 3) / 2
  floatView[I.hydrogenRadialThreshold] =
    25.0 * nEff * bohrRadius * (1.0 + 0.1 * validL) * hydrogenFieldScale

  // PERF: Precompute hydrogen radial normalization — eliminates per-sample log/exp/sqrt on GPU.
  // hydrogenRadialNormND(nr, lambda, nEff, a0) depends only on uniform-constant (n, l, dim, a0).
  const nr = validN - validL - 1
  const lambda = validL + (dimension - 3) / 2
  floatView[I.hydrogenRadialNorm] = computeHydrogenRadialNormND(nr, lambda, nEff, bohrRadius)

  // extraDimN: 2 vec4i = 8 ints
  // For coupled hydrogen ND, these slots carry the angular chain (l₂, l₃, ...)
  // instead of HO quantum numbers. The shader's getAngularChainL() reads from here.
  const isCoupled = p.quantumModeStr === 'hydrogenNDCoupled'
  const extraDimSource = isCoupled
    ? (schroedinger?.angularChain as number[] | undefined)
    : (schroedinger?.extraDimQuantumNumbers as number[] | undefined)
  for (let i = 0; i < MAX_EXTRA_DIM; i++) {
    intView[I.extraDimN + i] = extraDimSource?.[i] ?? 0
  }

  // extraDimOmega: 2 vec4f = 8 floats
  const extraDimOmega = schroedinger?.extraDimOmega as number[] | undefined
  const extraDimFrequencySpread = schroedinger?.extraDimFrequencySpread ?? 0
  for (let i = 0; i < MAX_EXTRA_DIM; i++) {
    const baseOmega = extraDimOmega?.[i] ?? 1.0
    const spread = 1.0 + (i - 3.5) * extraDimFrequencySpread
    floatView[I.extraDimOmega + i] = baseOmega * spread
  }

  // Precompute normalization constants for coupled hydrogen ND
  if (isCoupled && dimension >= 3) {
    packCoupledNorms(floatView, validN, validL, bohrRadius, dimension, extraDimSource)
  }

  return { validN, validL, bohrRadius }
}

// ---------------------------------------------------------------------------
// Coupled hydrogen ND — precomputed normalization constants
// ---------------------------------------------------------------------------

import {
  computeHydrogenRadialNormND,
  computeHypersphericalLayerNorm,
} from './uniformPackingHydrogenMath'

/**
 * Pack precomputed normalization constants for coupled hydrogen ND.
 * Layout: coupledNorms[0].x = radial norm, [0].yzw...[2].xyzw = layer norms
 */
function packCoupledNorms(
  floatView: Float32Array,
  n: number,
  l: number,
  a0: number,
  D: number,
  angularChain: number[] | undefined
): void {
  const lambda = l + (D - 3) / 2
  const nr = n - l - 1
  const nEff = nr + lambda + 1

  // Slot 0: radial normalization constant
  floatView[I.coupledNorms] = computeHydrogenRadialNormND(nr, lambda, nEff, a0)

  // Slots 1..numLayers: hyperspherical layer norms
  const numTheta = D - 2
  const numLayers = numTheta - 1

  for (let k = 0; k < numLayers && k < 11; k++) {
    const lk = k === 0 ? l : (angularChain?.[k - 1] ?? 0)
    const lkp1 = angularChain?.[k] ?? 0
    floatView[I.coupledNorms + k + 1] = computeHypersphericalLayerNorm(lk, lkp1, D, k)
  }
}

/** Pack visual/appearance fields (active fields only — reserved fields zeroed by caller). */
function packVisualFields(
  floatView: Float32Array,
  intView: Int32Array,
  p: SchroedingerPackParams
): void {
  const { schroedinger, appearance, pbr, canonicalDensityCompensation, cachedPeakDensity } = p

  intView[I.phaseAnimationEnabled] = schroedinger?.phaseAnimationEnabled ? 1 : 0
  floatView[I.timeScale] = schroedinger?.timeScale ?? 0.8
  floatView[I.fieldScale] = schroedinger?.fieldScale ?? 1.0
  floatView[I.densityGain] = (schroedinger?.densityGain ?? 2.0) * canonicalDensityCompensation
  floatView[I.powderScale] = schroedinger?.powderScale ?? 1.0
  floatView[I.emissionIntensity] = appearance?.faceEmission ?? 0.0
  floatView[I.emissionThreshold] = appearance?.faceEmissionThreshold ?? 0.0
  floatView[I.emissionColorShift] = appearance?.faceEmissionColorShift ?? 0.0
  floatView[I.peakDensity] = cachedPeakDensity
  floatView[I.densityContrast] = schroedinger?.densityContrast ?? 1.8
  floatView[I.scatteringAnisotropy] = schroedinger?.scatteringAnisotropy ?? 0.0
  floatView[I.roughness] = pbr?.face?.roughness ?? 0.3

  // Classical-quantum correspondence overlay (delegated to extracted module)
  packClassicalOverlay(floatView, intView, p, parseColor)
}

/** Pack nodal fields, color algorithm, and cosine palette. */
function packNodalAndColorSystem(
  floatView: Float32Array,
  intView: Int32Array,
  p: SchroedingerPackParams
): void {
  const {
    isDensityMatrixMode,
    schroedinger,
    appearance,
    colorAlgorithm,
    effectiveSampleCount,
    animationTime,
  } = p

  intView[I.nodalEnabled] = !isDensityMatrixMode && schroedinger?.nodalEnabled ? 1 : 0

  const nodalColor = parseColor(schroedinger?.nodalColor ?? '#00ffff')
  floatView[I.nodalColor] = nodalColor[0]
  floatView[I.nodalColor + 1] = nodalColor[1]
  floatView[I.nodalColor + 2] = nodalColor[2]
  floatView[I.nodalStrength] = schroedinger?.nodalStrength ?? 1.0

  intView[I.uncertaintyBoundaryEnabled] = schroedinger?.uncertaintyBoundaryEnabled ? 1 : 0
  floatView[I.uncertaintyBoundaryStrength] = schroedinger?.uncertaintyBoundaryStrength ?? 0.5
  floatView[I.time] = animationTime
  intView[I.isoEnabled] = schroedinger?.isoEnabled ? 1 : 0
  floatView[I.isoThreshold] = schroedinger?.isoThreshold ?? -3.0
  intView[I.sampleCount] = effectiveSampleCount

  // Color algorithm system
  intView[I.colorAlgorithm] = colorAlgorithm
  floatView[I.distPower] = appearance?.distribution?.power ?? 1.0
  floatView[I.distCycles] = appearance?.distribution?.cycles ?? 1.0
  floatView[I.distOffset] = appearance?.distribution?.offset ?? 0.0

  // Cosine palette coefficients
  const cosineCoeffs = appearance?.cosineCoefficients ?? {
    a: [0.5, 0.5, 0.5],
    b: [0.5, 0.5, 0.5],
    c: [1.0, 1.0, 1.0],
    d: [0.0, 0.33, 0.67],
  }
  packVec4Color(floatView, I.cosineA, cosineCoeffs.a, [0.5, 0.5, 0.5])
  packVec4Color(floatView, I.cosineB, cosineCoeffs.b, [0.5, 0.5, 0.5])
  packVec4Color(floatView, I.cosineC, cosineCoeffs.c, [1.0, 1.0, 1.0])
  packVec4Color(floatView, I.cosineD, cosineCoeffs.d, [0.0, 0.33, 0.67])
}

/** Pack phase materiality and interference fields. */
function packPhaseAndInterference(
  floatView: Float32Array,
  intView: Int32Array,
  boundingRadius: number,
  isDensityMatrixMode: boolean,
  schroedinger: Partial<SchroedingerConfig> | undefined
): void {
  floatView[I.boundingRadius] = boundingRadius
  floatView[I.invBoundingRadius] = 1.0 / boundingRadius
  intView[I.phaseMaterialityEnabled] =
    !isDensityMatrixMode && schroedinger?.phaseMaterialityEnabled ? 1 : 0
  floatView[I.phaseMaterialityStrength] = schroedinger?.phaseMaterialityStrength ?? 1.0
  intView[I.interferenceEnabled] = !isDensityMatrixMode && schroedinger?.interferenceEnabled ? 1 : 0
  floatView[I.interferenceAmp] = schroedinger?.interferenceAmp ?? 0.5
  floatView[I.interferenceFreq] = schroedinger?.interferenceFreq ?? 10.0
  floatView[I.interferenceSpeed] = schroedinger?.interferenceSpeed ?? 1.0
}

/** Pack nodal surface controls. */
function packNodalControls(
  floatView: Float32Array,
  intView: Int32Array,
  schroedinger: Partial<SchroedingerConfig> | undefined
): void {
  intView[I.nodalDefinition] = NODAL_DEFINITION_MAP[schroedinger?.nodalDefinition ?? 'psiAbs'] ?? 0
  floatView[I.nodalTolerance] = schroedinger?.nodalTolerance ?? 0.02
  intView[I.nodalFamilyFilter] = NODAL_FAMILY_MAP[schroedinger?.nodalFamilyFilter ?? 'all'] ?? 0
  intView[I.nodalLobeColoringEnabled] = schroedinger?.nodalLobeColoringEnabled ? 1 : 0
  packColorRgba(floatView, I.nodalColorReal, schroedinger?.nodalColorReal ?? '#00ffff')
  packColorRgba(floatView, I.nodalColorImag, schroedinger?.nodalColorImag ?? '#ff66ff')
  packColorRgba(floatView, I.nodalColorPositive, schroedinger?.nodalColorPositive ?? '#22c55e')
  packColorRgba(floatView, I.nodalColorNegative, schroedinger?.nodalColorNegative ?? '#ef4444')
  intView[I.nodalRenderMode] = NODAL_RENDER_MODE_MAP[schroedinger?.nodalRenderMode ?? 'band'] ?? 0
}

/** Pack bounding radius, interference, physical nodal controls, and flow. */
function packOverlayControls(
  floatView: Float32Array,
  intView: Int32Array,
  p: SchroedingerPackParams
): void {
  const { isDensityMatrixMode, schroedinger, appearance } = p

  packPhaseAndInterference(floatView, intView, p.boundingRadius, isDensityMatrixMode, schroedinger)
  packNodalControls(floatView, intView, schroedinger)

  // Probability flow + uncertainty
  intView[I.probabilityFlowEnabled] = schroedinger?.probabilityFlowEnabled ? 1 : 0
  floatView[I.probabilityFlowSpeed] = schroedinger?.probabilityFlowSpeed ?? 1.0
  floatView[I.probabilityFlowStrength] = schroedinger?.probabilityFlowStrength ?? 0.3
  floatView[I.uncertaintyConfidenceMass] = p.uncertaintyConfidenceMass
  floatView[I.lchLightness] = appearance?.lchLightness ?? 0.7
  floatView[I.lchChroma] = appearance?.lchChroma ?? 0.15
  floatView[I.uncertaintyBoundaryWidth] = p.uncertaintyBoundaryWidth
  floatView[I.uncertaintyLogRhoThreshold] = p.uncertaintyLogRhoThreshold

  // Multi-source blend weights
  const msWeights = appearance?.multiSourceWeights
  floatView[I.multiSourceWeights] = msWeights?.depth ?? 0.5
  floatView[I.multiSourceWeights + 1] = msWeights?.orbitTrap ?? 0.3
  floatView[I.multiSourceWeights + 2] = msWeights?.normal ?? 0.2
  floatView[I.multiSourceWeights + 3] = 0.0
}

/** Pack cross-section slice controls. */
function packCrossSectionSlice(
  floatView: Float32Array,
  intView: Int32Array,
  isUniformComputeMode: boolean,
  schroedinger: Partial<SchroedingerConfig> | undefined
): void {
  const crossSectionNormal = schroedinger?.crossSectionPlaneNormal ?? [0, 0, 1]
  const nx = Number(crossSectionNormal[0] ?? 0)
  const ny = Number(crossSectionNormal[1] ?? 0)
  const nz = Number(crossSectionNormal[2] ?? 1)
  const nLen = Math.hypot(nx, ny, nz)
  const invNLen = nLen > 1e-6 ? 1.0 / nLen : 1.0

  intView[I.crossSectionEnabled] =
    !isUniformComputeMode && schroedinger?.crossSectionEnabled ? 1 : 0
  intView[I.crossSectionCompositeMode] =
    CROSS_SECTION_COMPOSITE_MODE_MAP[schroedinger?.crossSectionCompositeMode ?? 'overlay'] ?? 0
  intView[I.crossSectionScalar] =
    CROSS_SECTION_SCALAR_MAP[schroedinger?.crossSectionScalar ?? 'density'] ?? 0
  intView[I.crossSectionAutoWindow] = schroedinger?.crossSectionAutoWindow ? 1 : 0

  floatView[I.crossSectionPlane] = nx * invNLen
  floatView[I.crossSectionPlane + 1] = ny * invNLen
  floatView[I.crossSectionPlane + 2] = nz * invNLen
  floatView[I.crossSectionPlane + 3] = schroedinger?.crossSectionPlaneOffset ?? 0.0

  floatView[I.crossSectionWindow] = schroedinger?.crossSectionWindowMin ?? 0.0
  floatView[I.crossSectionWindow + 1] = schroedinger?.crossSectionWindowMax ?? 1.0
  floatView[I.crossSectionWindow + 2] = schroedinger?.crossSectionOpacity ?? 0.75
  floatView[I.crossSectionWindow + 3] = schroedinger?.crossSectionThickness ?? 0.02

  packColorRgba(
    floatView,
    I.crossSectionPlaneColor,
    schroedinger?.crossSectionPlaneColor ?? '#66ccff'
  )
}

/** Pack physical probability current controls. */
function packProbabilityCurrent(
  floatView: Float32Array,
  intView: Int32Array,
  isUniformComputeMode: boolean,
  isDensityMatrixMode: boolean,
  schroedinger: Partial<SchroedingerConfig> | undefined
): void {
  const probabilityCurrentEnabled =
    !isDensityMatrixMode &&
    !isUniformComputeMode &&
    (schroedinger?.probabilityCurrentEnabled ?? false)
  intView[I.probabilityCurrentEnabled] = probabilityCurrentEnabled ? 1 : 0
  intView[I.probabilityCurrentStyle] =
    PROBABILITY_CURRENT_STYLE_MAP[schroedinger?.probabilityCurrentStyle ?? 'magnitude'] ?? 0
  intView[I.probabilityCurrentPlacement] =
    PROBABILITY_CURRENT_PLACEMENT_MAP[schroedinger?.probabilityCurrentPlacement ?? 'isosurface'] ??
    0
  intView[I.probabilityCurrentColorMode] =
    PROBABILITY_CURRENT_COLOR_MODE_MAP[schroedinger?.probabilityCurrentColorMode ?? 'magnitude'] ??
    0

  floatView[I.probabilityCurrentScale] = schroedinger?.probabilityCurrentScale ?? 1.0
  floatView[I.probabilityCurrentSpeed] = schroedinger?.probabilityCurrentSpeed ?? 1.0
  floatView[I.probabilityCurrentDensityThreshold] =
    schroedinger?.probabilityCurrentDensityThreshold ?? 0.01
  floatView[I.probabilityCurrentMagnitudeThreshold] =
    schroedinger?.probabilityCurrentMagnitudeThreshold ?? 0.0
  const lineDensity = schroedinger?.probabilityCurrentLineDensity ?? 8.0
  const stepSize = schroedinger?.probabilityCurrentStepSize ?? 0.04
  const integrationSteps = schroedinger?.probabilityCurrentSteps ?? 20
  const isMomentum = !isUniformComputeMode && schroedinger?.representation === 'momentum'
  floatView[I.probabilityCurrentLineDensity] = isMomentum ? Math.min(lineDensity, 3.0) : lineDensity
  floatView[I.probabilityCurrentStepSize] = isMomentum ? Math.max(stepSize, 0.02) : stepSize
  intView[I.probabilityCurrentSteps] = isMomentum ? Math.min(integrationSteps, 8) : integrationSteps
  floatView[I.probabilityCurrentOpacity] = schroedinger?.probabilityCurrentOpacity ?? 0.7
}

/** Pack cross-section and probability current controls. */
function packCrossSectionAndCurrent(
  floatView: Float32Array,
  intView: Int32Array,
  p: SchroedingerPackParams
): void {
  packCrossSectionSlice(floatView, intView, p.isUniformComputeMode, p.schroedinger)
  packProbabilityCurrent(
    floatView,
    intView,
    p.isUniformComputeMode,
    p.isDensityMatrixMode,
    p.schroedinger
  )
}

/** Pack representation, radial probability, domain coloring, and diverging. */
function packRepresentationAndColorOverlays(
  floatView: Float32Array,
  intView: Int32Array,
  p: SchroedingerPackParams,
  hydrogen: HydrogenResult
): void {
  const { isUniformComputeMode, isDensityMatrixMode, quantumModeStr, schroedinger, appearance } = p

  // Representation + momentum controls
  const forcePosition =
    isUniformComputeMode ||
    (isDensityMatrixMode &&
      (quantumModeStr === 'hydrogenND' || quantumModeStr === 'hydrogenNDCoupled'))
  intView[I.representationMode] = forcePosition
    ? 0
    : (REPRESENTATION_MODE_MAP[schroedinger?.representation ?? 'position'] ?? 0)
  intView[I.momentumDisplayMode] =
    MOMENTUM_DISPLAY_MODE_MAP[schroedinger?.momentumDisplayUnits ?? 'k'] ?? 0
  floatView[I.momentumScale] = p.effectiveMomentumScale
  floatView[I.momentumHbar] = schroedinger?.momentumHbar ?? 1.0

  // Radial probability overlay
  const isMomentumRep = !isUniformComputeMode && schroedinger?.representation === 'momentum'
  const radialProbEnabled = (schroedinger?.radialProbabilityEnabled ?? false) && !isMomentumRep
  intView[I.radialProbabilityEnabled] = radialProbEnabled ? 1 : 0
  floatView[I.radialProbabilityOpacity] = schroedinger?.radialProbabilityOpacity ?? 0.6
  floatView[I.radialProbabilityNorm] =
    radialProbEnabled && quantumModeStr !== 'harmonicOscillator'
      ? computeRadialProbabilityNorm(
          hydrogen.validN,
          hydrogen.validL,
          hydrogen.bohrRadius,
          p.dimension
        )
      : 1.0
  packColorRgba(
    floatView,
    I.radialProbabilityColor,
    schroedinger?.radialProbabilityColor ?? '#44aaff'
  )

  // Domain coloring controls
  const domainColoring = appearance?.domainColoring
  floatView[I.domainColoringParams0] = domainColoring?.modulusMode === 'logPsiAbs' ? 1.0 : 0.0
  floatView[I.domainColoringParams0 + 1] = domainColoring?.contoursEnabled ? 1.0 : 0.0
  floatView[I.domainColoringParams0 + 2] = domainColoring?.contourDensity ?? 8.0
  floatView[I.domainColoringParams0 + 3] = domainColoring?.contourWidth ?? 0.08
  floatView[I.domainColoringParams1] = domainColoring?.contourStrength ?? 0.45
  floatView[I.domainColoringParams1 + 1] = 0.0
  floatView[I.domainColoringParams1 + 2] = 0.0
  floatView[I.domainColoringParams1 + 3] = 0.0

  // Diverging color controls
  packDivergingColors(floatView, appearance)
}

/** Pack diverging color palette controls. */
function packDivergingColors(
  floatView: Float32Array,
  appearance: AppearanceStoreState | undefined
): void {
  const usePhaseDivergingPalette = appearance?.colorAlgorithm === 'phaseDiverging'
  const phaseDiverging = appearance?.phaseDiverging
  const divergingPsi = appearance?.divergingPsi
  const divergingNeutral = parseColor(
    usePhaseDivergingPalette
      ? (phaseDiverging?.neutralColor ?? '#ebebeb')
      : (divergingPsi?.neutralColor ?? '#d9d9d9')
  )
  const divergingPositive = parseColor(
    usePhaseDivergingPalette
      ? (phaseDiverging?.positiveColor ?? '#eb3d38')
      : (divergingPsi?.positiveColor ?? '#e83b3b')
  )
  const divergingNegative = parseColor(
    usePhaseDivergingPalette
      ? (phaseDiverging?.negativeColor ?? '#3866f2')
      : (divergingPsi?.negativeColor ?? '#3166f5')
  )
  floatView[I.divergingNeutralParams] = divergingNeutral[0]
  floatView[I.divergingNeutralParams + 1] = divergingNeutral[1]
  floatView[I.divergingNeutralParams + 2] = divergingNeutral[2]
  floatView[I.divergingNeutralParams + 3] = usePhaseDivergingPalette
    ? 0.2
    : Math.max(0, Math.min(1, divergingPsi?.intensityFloor ?? 0.2))

  floatView[I.divergingPositiveParams] = divergingPositive[0]
  floatView[I.divergingPositiveParams + 1] = divergingPositive[1]
  floatView[I.divergingPositiveParams + 2] = divergingPositive[2]
  floatView[I.divergingPositiveParams + 3] = usePhaseDivergingPalette
    ? 0.0
    : divergingPsi?.component === 'imag'
      ? 1.0
      : 0.0

  floatView[I.divergingNegativeParams] = divergingNegative[0]
  floatView[I.divergingNegativeParams + 1] = divergingNegative[1]
  floatView[I.divergingNegativeParams + 2] = divergingNegative[2]
  floatView[I.divergingNegativeParams + 3] = 0.0
}

/** Pack Wigner phase-space and Pauli spinor color fields. */
function packWignerAndPauliFields(
  floatView: Float32Array,
  intView: Int32Array,
  p: SchroedingerPackParams
): void {
  const { schroedinger, pauliSpinor, dimension } = p

  // Wigner phase-space controls
  const wignerDimIdx = schroedinger?.wignerDimensionIndex ?? 0
  intView[I.wignerDimensionIndex] = Math.max(0, Math.min(wignerDimIdx, dimension - 1))
  intView[I.wignerCrossTermsEnabled] = schroedinger?.wignerCrossTermsEnabled ? 1 : 0

  const wignerAutoRange = schroedinger?.wignerAutoRange ?? true
  if (wignerAutoRange) {
    packWignerAutoRange(floatView, intView, p, wignerDimIdx)
  } else {
    floatView[I.wignerXRange] = schroedinger?.wignerXRange ?? 6.0
    floatView[I.wignerPRange] = schroedinger?.wignerPRange ?? 6.0
  }
  intView[I.wignerQuadPoints] = schroedinger?.wignerQuadPoints ?? 32
  intView[I.wignerClassicalOverlay] = schroedinger?.wignerClassicalOverlay ? 1 : 0

  // Pauli spinor colors
  const spinUp = pauliSpinor?.spinUpColor ?? [0.0, 0.898, 1.0]
  const spinDown = pauliSpinor?.spinDownColor ?? [1.0, 0.0, 0.898]
  floatView[I.pauliSpinUpColor] = spinUp[0]!
  floatView[I.pauliSpinUpColor + 1] = spinUp[1]!
  floatView[I.pauliSpinUpColor + 2] = spinUp[2]!
  floatView[I.pauliSpinDownColor] = spinDown[0]!
  floatView[I.pauliSpinDownColor + 1] = spinDown[1]!
  floatView[I.pauliSpinDownColor + 2] = spinDown[2]!
}

/** Compute Wigner auto-range values based on quantum mode and state. */
function packWignerAutoRange(
  floatView: Float32Array,
  intView: Int32Array,
  p: SchroedingerPackParams,
  wignerDimIdx: number
): void {
  const { schroedinger } = p
  const isHydrogenMode =
    p.rendererQuantumMode === 'hydrogenND' || p.rendererQuantumMode === 'hydrogenNDCoupled'

  if (isHydrogenMode && wignerDimIdx < 3) {
    const n = schroedinger?.principalQuantumNumber ?? 2
    const a0 = schroedinger?.bohrRadiusScale ?? 1.0
    const rCenter = n * n * a0
    const rMax = rCenter * 2.5
    const halfExtent = Math.max(rCenter, rMax - rCenter)
    floatView[I.wignerXRange] = halfExtent
    floatView[I.wignerPRange] = 3.0 / (n * a0)
    return
  }

  let selectedOmega: number
  let maxN: number
  if (isHydrogenMode && wignerDimIdx >= 3) {
    const extraIdx = wignerDimIdx - 3
    selectedOmega = floatView[I.extraDimOmega + extraIdx] ?? 1.0
    maxN = intView[I.extraDimN + extraIdx] ?? 0
  } else {
    selectedOmega = floatView[I.omega + Math.min(wignerDimIdx, 10)] ?? 1.0
    maxN = 0
    const tc = p.rendererTermCount ?? 1
    for (let k = 0; k < tc; k++) {
      const qn = intView[I.quantum + k * 11 + Math.min(wignerDimIdx, 10)] ?? 0
      if (qn > maxN) maxN = qn
    }
  }
  const xScale = Math.sqrt(Math.max(2 * maxN + 1, 1) / Math.max(selectedOmega, 0.01))
  const pScale = Math.sqrt(Math.max(2 * maxN + 1, 1) * Math.max(selectedOmega, 0.01))
  floatView[I.wignerXRange] = xScale * 3.5
  floatView[I.wignerPRange] = pScale * 3.5
}

// ---------------------------------------------------------------------------
// Micro-helpers for repeated color packing patterns
// ---------------------------------------------------------------------------

/** Pack a hex color as vec4f (RGB + 0.0 padding) at the given float index. */
function packColorRgba(floatView: Float32Array, idx: number, hex: string): void {
  const rgb = parseColor(hex)
  floatView[idx] = rgb[0]
  floatView[idx + 1] = rgb[1]
  floatView[idx + 2] = rgb[2]
  floatView[idx + 3] = 0.0
}

/** Pack a 3-element array as vec4f (xyz + 0.0 padding), with per-component defaults. */
function packVec4Color(
  floatView: Float32Array,
  idx: number,
  values: number[] | undefined,
  defaults: [number, number, number]
): void {
  floatView[idx] = values?.[0] ?? defaults[0]
  floatView[idx + 1] = values?.[1] ?? defaults[1]
  floatView[idx + 2] = values?.[2] ?? defaults[2]
  floatView[idx + 3] = 0.0
}

// Re-export support functions from the split module
export {
  applyHOMomentumTransform,
  type BasisPackParams,
  type CameraPackParams,
  computeCanonicalCompensation,
  type MaterialPackParams,
  packBasisVectors,
  packCameraUniforms,
  packMaterialUniforms,
  packQualityUniforms,
} from './uniformPackingSupport'
