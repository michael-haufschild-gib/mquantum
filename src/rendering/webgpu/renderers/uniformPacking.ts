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

import type { AntiDeSitterConfig } from '@/lib/geometry/extended/antiDeSitter'
import type { SchroedingerConfig } from '@/lib/geometry/extended/types'
import { DEFAULT_COSINE_COEFFICIENTS } from '@/rendering/shaders/palette'

import { MAX_DIM, MAX_EXTRA_DIM, MAX_TERMS } from '../shaders/schroedinger/uniforms.wgsl'
import { parseHexColorToLinearRgb, type Rgb } from '../utils/color'
import { zeroReservedFields } from '../utils/structLayout'
import {
  CROSS_SECTION_COMPOSITE_MODE_MAP,
  CROSS_SECTION_SCALAR_MAP,
  NODAL_DEFINITION_MAP,
  NODAL_FAMILY_MAP,
  NODAL_RENDER_MODE_MAP,
  PROBABILITY_CURRENT_COLOR_MODE_MAP,
  PROBABILITY_CURRENT_PLACEMENT_MAP,
  PROBABILITY_CURRENT_STYLE_MAP,
} from './schrodingerRendererTypes'
import { SCHROEDINGER_LAYOUT } from './schroedingerLayout'
import {
  packBilocalERBridge,
  packBornNullWeave,
  packEntropicTimeShear,
  packQuantumBackreaction,
  packSpectralDimensionFlow,
  packVacuumBubbleLens,
} from './uniformPackingBackreaction'
import {
  packRepresentationAndColorOverlays,
  packWignerAndPauliFields,
} from './uniformPackingColorOverlays'
import { packDensityGridMapping } from './uniformPackingDensityGrid'
import { packAdsTimeEvolution } from './uniformPackingSupport'
import type { SchroedingerPackParams } from './uniformPackingTypes'

export type { FlattenedPreset, SchroedingerPackParams } from './uniformPackingTypes'

// Field name → float32/int32 index (byte offset / 4)
const I = SCHROEDINGER_LAYOUT.index

type AdSConfig = AntiDeSitterConfig | undefined
type WdwPhaseConfig = { phaseRotationEnabled?: boolean; phaseRotationSpeed?: number }

// ---------------------------------------------------------------------------
// Shared helper
// ---------------------------------------------------------------------------

/** Parse hex color to linear RGB, defaulting to white on failure. */
const parseColor = (hex: string): Rgb => parseHexColorToLinearRgb(hex)

const isDensityGridOnlyMode = (mode: string): boolean =>
  mode === 'wheelerDeWitt' || mode === 'antiDeSitter'

// =========================================================================
// Schroedinger uniform buffer
// =========================================================================

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

  // Decoherent branching colors + separation metric
  const branchA = p.branchColorA ?? [0, 1, 1]
  const branchB = p.branchColorB ?? [1, 0, 1]
  floatView[I.branchColorA] = branchA[0]
  floatView[I.branchColorA + 1] = branchA[1]
  floatView[I.branchColorA + 2] = branchA[2]
  floatView[I.branchSeparation] = p.branchSeparation ?? 0
  floatView[I.branchColorB] = branchB[0]
  floatView[I.branchColorB + 1] = branchB[1]
  floatView[I.branchColorB + 2] = branchB[2]
  floatView[I.branchPlaneThreshold] = Number.isFinite(p.branchPlaneThreshold)
    ? p.branchPlaneThreshold!
    : 0
  const rawTransitionWidth = p.branchTransitionWidth ?? 0.2
  floatView[I.branchTransitionWidth] =
    Number.isFinite(rawTransitionWidth) && rawTransitionWidth > 0 ? rawTransitionWidth : 0.2

  // Wheeler–DeWitt render-only phase rotation rate.
  // Active only when quantum mode is wheelerDeWitt AND the visual effect is enabled,
  // otherwise 0 (so the shader's `phase - rate*time` subtraction is a no-op).
  const wdwCfg = p.schroedinger?.wheelerDeWitt as WdwPhaseConfig | undefined
  const wdwRate =
    p.quantumModeStr === 'wheelerDeWitt' && wdwCfg?.phaseRotationEnabled
      ? (wdwCfg.phaseRotationSpeed ?? 0)
      : 0
  floatView[I.wdwPhaseRotationRate] = wdwRate

  packDensityGridMapping(floatView, p)

  // AdS time evolution — stable phase rotation at E or tachyon cosh growth at γ.
  packAdsTimeEvolution(floatView, p.quantumModeStr, p.schroedinger?.antiDeSitter as AdSConfig)
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
    packCoupledNorms(floatView, validL, dimension, extraDimSource)
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
 * Pack precomputed hyperspherical-layer norms for coupled hydrogen ND.
 *
 * Layout: coupledNorms[0] is reserved; layer k (k = 0..D-4) is packed at
 * slot k+1. The shader reads via `getCoupledLayerNorm(uniforms, k)`.
 *
 * The radial norm is stored separately in `hydrogenRadialNorm`; writing it
 * here too would duplicate the uniform without any shader consuming it.
 */
function packCoupledNorms(
  floatView: Float32Array,
  l: number,
  D: number,
  angularChain: number[] | undefined
): void {
  const numTheta = D - 2
  const numLayers = numTheta - 1
  const MAX_LAYERS = 11

  for (let k = 0; k < numLayers && k < MAX_LAYERS; k++) {
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
  // Emission color shift is meaningless in Wigner phase-space mode — force to zero
  const isWigner = schroedinger?.representation === 'wigner'
  floatView[I.emissionColorShift] = isWigner ? 0.0 : (appearance?.faceEmissionColorShift ?? 0.0)
  floatView[I.peakDensity] = cachedPeakDensity
  floatView[I.densityContrast] = schroedinger?.densityContrast ?? 1.8
  floatView[I.scatteringAnisotropy] = schroedinger?.scatteringAnisotropy ?? 0.0
  floatView[I.roughness] = pbr?.face?.roughness ?? 0.3
  packQuantumBackreaction(floatView, intView, schroedinger)
  packBilocalERBridge(floatView, intView, schroedinger)
  packEntropicTimeShear(floatView, intView, schroedinger)
  packSpectralDimensionFlow(floatView, intView, schroedinger)
  packVacuumBubbleLens(floatView, intView, schroedinger)
  packBornNullWeave(
    floatView,
    intView,
    schroedinger,
    p.isUniformComputeMode || isDensityGridOnlyMode(p.quantumModeStr)
  )
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
  const cosineCoeffs = appearance?.cosineCoefficients ?? DEFAULT_COSINE_COEFFICIENTS
  packVec4Color(floatView, I.cosineA, cosineCoeffs.a, DEFAULT_COSINE_COEFFICIENTS.a)
  packVec4Color(floatView, I.cosineB, cosineCoeffs.b, DEFAULT_COSINE_COEFFICIENTS.b)
  packVec4Color(floatView, I.cosineC, cosineCoeffs.c, DEFAULT_COSINE_COEFFICIENTS.c)
  packVec4Color(floatView, I.cosineD, cosineCoeffs.d, DEFAULT_COSINE_COEFFICIENTS.d)
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

  // Phase shimmer + uncertainty
  intView[I.phaseShimmerEnabled] = schroedinger?.phaseShimmerEnabled ? 1 : 0
  floatView[I.phaseShimmerSpeed] = schroedinger?.phaseShimmerSpeed ?? 1.0
  floatView[I.phaseShimmerStrength] = schroedinger?.phaseShimmerStrength ?? 0.3
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
  // Pre-normalize the plane normal here so the GPU shader can read xyz directly
  // (see crossSection.wgsl.ts). lengthSq < 1e-8 falls back to (0,0,1) — matches
  // the previous WGSL-side fallback threshold exactly.
  const crossSectionNormal = schroedinger?.crossSectionPlaneNormal ?? [0, 0, 1]
  const nx = Number(crossSectionNormal[0] ?? 0)
  const ny = Number(crossSectionNormal[1] ?? 0)
  const nz = Number(crossSectionNormal[2] ?? 1)
  const nLenSq = nx * nx + ny * ny + nz * nz
  const degenerate = !Number.isFinite(nLenSq) || nLenSq < 1e-8
  const invNLen = degenerate ? 1.0 : 1.0 / Math.sqrt(nLenSq)
  const outNx = degenerate ? 0.0 : nx * invNLen
  const outNy = degenerate ? 0.0 : ny * invNLen
  const outNz = degenerate ? 1.0 : nz * invNLen

  intView[I.crossSectionEnabled] =
    !isUniformComputeMode && schroedinger?.crossSectionEnabled ? 1 : 0
  intView[I.crossSectionCompositeMode] =
    CROSS_SECTION_COMPOSITE_MODE_MAP[schroedinger?.crossSectionCompositeMode ?? 'overlay'] ?? 0
  intView[I.crossSectionScalar] =
    CROSS_SECTION_SCALAR_MAP[schroedinger?.crossSectionScalar ?? 'density'] ?? 0
  intView[I.crossSectionAutoWindow] = schroedinger?.crossSectionAutoWindow ? 1 : 0

  floatView[I.crossSectionPlane] = outNx
  floatView[I.crossSectionPlane + 1] = outNy
  floatView[I.crossSectionPlane + 2] = outNz
  // .w is the plane offset scalar — never normalized.
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

function packColorRgba(floatView: Float32Array, idx: number, hex: string): void {
  const rgb = parseColor(hex)
  floatView[idx] = rgb[0]
  floatView[idx + 1] = rgb[1]
  floatView[idx + 2] = rgb[2]
  floatView[idx + 3] = 0.0
}

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

export { packAdsTimeEvolution }
export { packPrecomputedHOTerms } from './uniformPackingHOTerms'
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
