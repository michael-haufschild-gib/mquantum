/**
 * Pure uniform-packing functions for the Schrodinger renderer.
 *
 * Every function in this module writes pre-computed values into typed arrays
 * at exact byte offsets matching the WGSL struct layouts. No GPU resources,
 * no class state, no store access. The renderer orchestrates store reads,
 * dirty checks, and buffer uploads; this module only does the packing.
 *
 * @module rendering/webgpu/renderers/uniformPacking
 */

import type { QuantumPreset } from '@/lib/geometry/extended/schroedinger/presets'
import type { SchroedingerConfig } from '@/lib/geometry/extended/types'
import { logger } from '@/lib/logger'
import { computeRadialProbabilityNorm } from '@/lib/math/hydrogenRadialProbability'
import type { AppearanceStoreState } from '@/stores/appearanceStore'
import type { PBRSliceState } from '@/stores/slices/visual/pbrSlice'

import { MAX_DIM, MAX_EXTRA_DIM, MAX_TERMS } from '../shaders/schroedinger/uniforms.wgsl'
import { parseHexColorToLinearRgb } from '../utils/color'
import type { CameraSnapshot, TransformSnapshot } from './schrodingerRendererTypes'
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
}

/**
 * Pack all Schroedinger uniform values into the pre-allocated typed-array views.
 *
 * Byte offsets match the WGSL `SchroedingerUniforms` struct layout exactly.
 * See `uniforms.wgsl.ts` for the authoritative struct definition.
 */
export function packSchroedingerUniforms(
  floatView: Float32Array,
  intView: Int32Array,
  p: SchroedingerPackParams
): void {
  // --- Scalars (offset 0-15) ---
  intView[0] = p.quantumModeInt
  intView[1] = p.presetTermCount
  intView[2] = 0 // _padScalar0
  intView[3] = 0 // _padScalar1

  packQuantumArrays(floatView, intView, p)
  const hydrogenResult = packHydrogenAndExtraDims(floatView, intView, p)
  packVisualAndReserved(floatView, intView, p)
  packNodalAndColorSystem(floatView, intView, p)
  packOverlayControls(floatView, intView, p)
  packCrossSectionAndCurrent(floatView, intView, p)
  packRepresentationAndColorOverlays(floatView, intView, p, hydrogenResult)
  packWignerAndPauliFields(floatView, intView, p)
}

// ---------------------------------------------------------------------------
// Sub-packers — each handles a contiguous block of byte offsets
// ---------------------------------------------------------------------------

/** Result from hydrogen packing needed by downstream sub-packers. */
interface HydrogenResult {
  validN: number
  validL: number
  bohrRadius: number
}

/** Pack omega, quantum, coeff, energy arrays (offsets 16-575). */
function packQuantumArrays(
  floatView: Float32Array,
  intView: Int32Array,
  p: SchroedingerPackParams
): void {
  const { presetData } = p

  // omega array (offset 16, 3 vec4f = 12 floats, use 11)
  const omegaOffset = 16 / 4
  for (let i = 0; i < MAX_DIM; i++) {
    floatView[omegaOffset + i] = presetData?.omega[i] ?? 1.0
  }
  floatView[omegaOffset + 11] = 0.0

  // quantum array (offset 64, 22 vec4i = 88 ints)
  const quantumOffset = 64 / 4
  for (let i = 0; i < MAX_TERMS * MAX_DIM; i++) {
    intView[quantumOffset + i] = presetData?.quantum[i] ?? 0
  }

  // coeff array (offset 416, 8 vec4f, xy = complex value, zw = padding)
  const coeffOffset = 416 / 4
  for (let i = 0; i < MAX_TERMS; i++) {
    const baseIdx = coeffOffset + i * 4
    floatView[baseIdx] = presetData?.coeff[i * 2] ?? (i === 0 ? 1.0 : 0.0)
    floatView[baseIdx + 1] = presetData?.coeff[i * 2 + 1] ?? 0.0
    floatView[baseIdx + 2] = 0.0
    floatView[baseIdx + 3] = 0.0
  }

  // energy array (offset 544, 2 vec4f = 8 floats)
  const energyOffset = 544 / 4
  for (let i = 0; i < MAX_TERMS; i++) {
    floatView[energyOffset + i] = presetData?.energy[i] ?? 0.5
  }
}

/** Pack hydrogen quantum numbers, boosts, and extra-dimension arrays (offsets 576-671). */
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

  intView[576 / 4] = validN
  intView[580 / 4] = validL
  intView[584 / 4] = validM
  floatView[588 / 4] = bohrRadius
  intView[592 / 4] = schroedinger?.useRealOrbitals ? 1 : 0

  // hydrogenBoost = 50 * n^2 * 3^l
  const lBoost = Math.pow(3.0, validL)
  const hydrogenBoost = 50.0 * validN * validN * lBoost
  floatView[596 / 4] = hydrogenBoost

  // hydrogenNDBoost: compensate for HO normalization in extra dimensions
  const numExtraDims = Math.max(0, dimension - 3)
  let normCompensation = 1.0
  for (let i = 0; i < numExtraDims; i++) {
    const baseOmega = (schroedinger?.extraDimOmega as number[] | undefined)?.[i] ?? 1.0
    const spread = 1.0 + (i - 3.5) * (schroedinger?.extraDimFrequencySpread ?? 0)
    const effectiveOmega = Math.max(baseOmega * spread, 0.01)
    normCompensation *= Math.sqrt(Math.PI / effectiveOmega)
  }
  floatView[600 / 4] = hydrogenBoost * normCompensation

  // hydrogenRadialThreshold
  const hydrogenFieldScale = schroedinger?.fieldScale ?? 1.0
  floatView[604 / 4] = 25.0 * validN * bohrRadius * (1.0 + 0.1 * validL) * hydrogenFieldScale

  // extraDimN array (offset 608, 2 vec4i = 8 ints)
  const extraDimQuantumNumbers = schroedinger?.extraDimQuantumNumbers as number[] | undefined
  for (let i = 0; i < MAX_EXTRA_DIM; i++) {
    intView[608 / 4 + i] = extraDimQuantumNumbers?.[i] ?? 0
  }

  // extraDimOmega array (offset 640, 2 vec4f = 8 floats)
  const extraDimOmega = schroedinger?.extraDimOmega as number[] | undefined
  const extraDimFrequencySpread = schroedinger?.extraDimFrequencySpread ?? 0
  for (let i = 0; i < MAX_EXTRA_DIM; i++) {
    const baseOmega = extraDimOmega?.[i] ?? 1.0
    const spread = 1.0 + (i - 3.5) * extraDimFrequencySpread
    floatView[640 / 4 + i] = baseOmega * spread
  }

  return { validN, validL, bohrRadius }
}

/** Pack visual/appearance fields and reserved padding (offsets 672-860). */
function packVisualAndReserved(
  floatView: Float32Array,
  intView: Int32Array,
  p: SchroedingerPackParams
): void {
  const { schroedinger, appearance, pbr, canonicalDensityCompensation, cachedPeakDensity } = p

  intView[672 / 4] = schroedinger?.phaseAnimationEnabled ? 1 : 0
  floatView[676 / 4] = schroedinger?.timeScale ?? 0.8
  floatView[680 / 4] = schroedinger?.fieldScale ?? 1.0
  floatView[684 / 4] = (schroedinger?.densityGain ?? 2.0) * canonicalDensityCompensation
  floatView[688 / 4] = schroedinger?.powderScale ?? 1.0
  floatView[692 / 4] = appearance?.faceEmission ?? 0.0
  floatView[696 / 4] = appearance?.faceEmissionThreshold ?? 0.0
  floatView[700 / 4] = appearance?.faceEmissionColorShift ?? 0.0
  floatView[704 / 4] = cachedPeakDensity
  floatView[708 / 4] = schroedinger?.densityContrast ?? 1.8
  floatView[712 / 4] = schroedinger?.scatteringAnisotropy ?? 0.0
  floatView[716 / 4] = pbr?.face?.roughness ?? 0.3

  // Reserved padding at offset 720-860 (formerly SSS, erosion, curl noise, dispersion, shadows)
  intView[720 / 4] = 0
  floatView[724 / 4] = 0.0
  floatView[736 / 4] = 0.0
  floatView[740 / 4] = 0.0
  floatView[744 / 4] = 0.0
  floatView[748 / 4] = 0.0
  floatView[752 / 4] = 0.0
  floatView[756 / 4] = 0.0
  floatView[760 / 4] = 0.0
  floatView[764 / 4] = 0.0
  floatView[768 / 4] = 0.0
  intView[772 / 4] = 0
  intView[776 / 4] = 0
  floatView[780 / 4] = 0.0
  floatView[784 / 4] = 0.0
  floatView[788 / 4] = 0.0
  intView[792 / 4] = 0
  intView[796 / 4] = 0
  floatView[800 / 4] = 0.0
  intView[804 / 4] = 0
  intView[808 / 4] = 0
  intView[812 / 4] = 0
  floatView[816 / 4] = 0
  intView[820 / 4] = 0
  floatView[824 / 4] = 0
  intView[828 / 4] = 0
  floatView[832 / 4] = 0
  floatView[848 / 4] = 0
  floatView[852 / 4] = 0
  floatView[856 / 4] = 0
  floatView[860 / 4] = 0
}

/** Pack nodal fields, color algorithm, and cosine palette (offsets 864-1036). */
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

  intView[864 / 4] = !isDensityMatrixMode && schroedinger?.nodalEnabled ? 1 : 0

  const nodalColor = parseColor(schroedinger?.nodalColor ?? '#00ffff')
  floatView[880 / 4] = nodalColor[0]
  floatView[884 / 4] = nodalColor[1]
  floatView[888 / 4] = nodalColor[2]
  floatView[892 / 4] = schroedinger?.nodalStrength ?? 1.0

  intView[896 / 4] = 0 // _padEnergy
  intView[900 / 4] = schroedinger?.uncertaintyBoundaryEnabled ? 1 : 0
  floatView[904 / 4] = schroedinger?.uncertaintyBoundaryStrength ?? 0.5
  floatView[908 / 4] = animationTime
  intView[912 / 4] = schroedinger?.isoEnabled ? 1 : 0
  floatView[916 / 4] = schroedinger?.isoThreshold ?? -3.0
  intView[920 / 4] = effectiveSampleCount

  // Reserved (formerly phase shift)
  intView[924 / 4] = 0
  floatView[928 / 4] = 0.0
  floatView[932 / 4] = 0.0
  floatView[936 / 4] = 0.0

  // Color algorithm system (offset 940+)
  intView[940 / 4] = colorAlgorithm
  floatView[944 / 4] = appearance?.distribution?.power ?? 1.0
  floatView[948 / 4] = appearance?.distribution?.cycles ?? 1.0
  floatView[952 / 4] = appearance?.distribution?.offset ?? 0.0

  // Cosine palette coefficients (offset 960-1024)
  const cosineCoeffs = appearance?.cosineCoefficients ?? {
    a: [0.5, 0.5, 0.5],
    b: [0.5, 0.5, 0.5],
    c: [1.0, 1.0, 1.0],
    d: [0.0, 0.33, 0.67],
  }
  packVec4Color(floatView, 960 / 4, cosineCoeffs.a, [0.5, 0.5, 0.5])
  packVec4Color(floatView, 976 / 4, cosineCoeffs.b, [0.5, 0.5, 0.5])
  packVec4Color(floatView, 992 / 4, cosineCoeffs.c, [1.0, 1.0, 1.0])
  packVec4Color(floatView, 1008 / 4, cosineCoeffs.d, [0.0, 0.33, 0.67])

  // Reserved padding
  intView[1024 / 4] = 0
  floatView[1028 / 4] = 0.0
  floatView[1032 / 4] = 0.0
  intView[1036 / 4] = 0
}

/** Pack bounding radius, interference, physical nodal controls, and flow (offsets 1040-1212). */
function packOverlayControls(
  floatView: Float32Array,
  intView: Int32Array,
  p: SchroedingerPackParams
): void {
  const {
    isDensityMatrixMode,
    schroedinger,
    appearance,
    boundingRadius,
    uncertaintyConfidenceMass,
    uncertaintyBoundaryWidth,
    uncertaintyLogRhoThreshold,
  } = p

  // Dynamic bounding radius (offset 1040+)
  floatView[1040 / 4] = boundingRadius
  floatView[1044 / 4] = 1.0 / boundingRadius
  intView[1048 / 4] = !isDensityMatrixMode && schroedinger?.phaseMaterialityEnabled ? 1 : 0
  floatView[1052 / 4] = schroedinger?.phaseMaterialityStrength ?? 1.0

  // Interference fringing (offset 1056+)
  intView[1056 / 4] = !isDensityMatrixMode && schroedinger?.interferenceEnabled ? 1 : 0
  floatView[1060 / 4] = schroedinger?.interferenceAmp ?? 0.5
  floatView[1064 / 4] = schroedinger?.interferenceFreq ?? 10.0
  floatView[1068 / 4] = schroedinger?.interferenceSpeed ?? 1.0

  // Physical nodal controls (offset 1072+)
  intView[1072 / 4] = NODAL_DEFINITION_MAP[schroedinger?.nodalDefinition ?? 'psiAbs'] ?? 0
  floatView[1076 / 4] = schroedinger?.nodalTolerance ?? 0.02
  intView[1080 / 4] = NODAL_FAMILY_MAP[schroedinger?.nodalFamilyFilter ?? 'all'] ?? 0
  intView[1084 / 4] = schroedinger?.nodalLobeColoringEnabled ? 1 : 0

  packColorRgba(floatView, 1088 / 4, schroedinger?.nodalColorReal ?? '#00ffff')
  packColorRgba(floatView, 1104 / 4, schroedinger?.nodalColorImag ?? '#ff66ff')
  packColorRgba(floatView, 1120 / 4, schroedinger?.nodalColorPositive ?? '#22c55e')
  packColorRgba(floatView, 1136 / 4, schroedinger?.nodalColorNegative ?? '#ef4444')

  // Probability flow + uncertainty (offset 1152-1164)
  intView[1152 / 4] = schroedinger?.probabilityFlowEnabled ? 1 : 0
  floatView[1156 / 4] = schroedinger?.probabilityFlowSpeed ?? 1.0
  floatView[1160 / 4] = schroedinger?.probabilityFlowStrength ?? 0.3
  floatView[1164 / 4] = uncertaintyConfidenceMass

  // LCH + uncertainty boundary (offset 1168-1180)
  floatView[1168 / 4] = appearance?.lchLightness ?? 0.7
  floatView[1172 / 4] = appearance?.lchChroma ?? 0.15
  floatView[1176 / 4] = uncertaintyBoundaryWidth
  floatView[1180 / 4] = uncertaintyLogRhoThreshold

  // Multi-source blend weights (offset 1184-1200)
  const msWeights = appearance?.multiSourceWeights
  floatView[1184 / 4] = msWeights?.depth ?? 0.5
  floatView[1188 / 4] = msWeights?.orbitTrap ?? 0.3
  floatView[1192 / 4] = msWeights?.normal ?? 0.2
  floatView[1196 / 4] = 0.0

  // Nodal render mode (offset 1200-1216)
  intView[1200 / 4] = NODAL_RENDER_MODE_MAP[schroedinger?.nodalRenderMode ?? 'band'] ?? 0
  intView[1204 / 4] = 0
  floatView[1208 / 4] = 0.0
  floatView[1212 / 4] = 0.0
}

/** Pack cross-section and probability current controls (offsets 1216-1328). */
function packCrossSectionAndCurrent(
  floatView: Float32Array,
  intView: Int32Array,
  p: SchroedingerPackParams
): void {
  const { isUniformComputeMode, isDensityMatrixMode, schroedinger } = p

  // Cross-section slice controls (offset 1216-1280)
  const crossSectionNormal = schroedinger?.crossSectionPlaneNormal ?? [0, 0, 1]
  const nx = Number(crossSectionNormal[0] ?? 0)
  const ny = Number(crossSectionNormal[1] ?? 0)
  const nz = Number(crossSectionNormal[2] ?? 1)
  const nLen = Math.hypot(nx, ny, nz)
  const invNLen = nLen > 1e-6 ? 1.0 / nLen : 1.0

  intView[1216 / 4] = !isUniformComputeMode && schroedinger?.crossSectionEnabled ? 1 : 0
  intView[1220 / 4] =
    CROSS_SECTION_COMPOSITE_MODE_MAP[schroedinger?.crossSectionCompositeMode ?? 'overlay'] ?? 0
  intView[1224 / 4] = CROSS_SECTION_SCALAR_MAP[schroedinger?.crossSectionScalar ?? 'density'] ?? 0
  intView[1228 / 4] = schroedinger?.crossSectionAutoWindow ? 1 : 0

  floatView[1232 / 4] = nx * invNLen
  floatView[1236 / 4] = ny * invNLen
  floatView[1240 / 4] = nz * invNLen
  floatView[1244 / 4] = schroedinger?.crossSectionPlaneOffset ?? 0.0

  floatView[1248 / 4] = schroedinger?.crossSectionWindowMin ?? 0.0
  floatView[1252 / 4] = schroedinger?.crossSectionWindowMax ?? 1.0
  floatView[1256 / 4] = schroedinger?.crossSectionOpacity ?? 0.75
  floatView[1260 / 4] = schroedinger?.crossSectionThickness ?? 0.02

  packColorRgba(floatView, 1264 / 4, schroedinger?.crossSectionPlaneColor ?? '#66ccff')

  // Physical probability current controls (offset 1280-1328)
  const probabilityCurrentEnabled =
    !isDensityMatrixMode &&
    !isUniformComputeMode &&
    (schroedinger?.probabilityCurrentEnabled ?? false)
  intView[1280 / 4] = probabilityCurrentEnabled ? 1 : 0
  intView[1284 / 4] =
    PROBABILITY_CURRENT_STYLE_MAP[schroedinger?.probabilityCurrentStyle ?? 'magnitude'] ?? 0
  intView[1288 / 4] =
    PROBABILITY_CURRENT_PLACEMENT_MAP[schroedinger?.probabilityCurrentPlacement ?? 'isosurface'] ??
    0
  intView[1292 / 4] =
    PROBABILITY_CURRENT_COLOR_MODE_MAP[schroedinger?.probabilityCurrentColorMode ?? 'magnitude'] ??
    0

  floatView[1296 / 4] = schroedinger?.probabilityCurrentScale ?? 1.0
  floatView[1300 / 4] = schroedinger?.probabilityCurrentSpeed ?? 1.0
  floatView[1304 / 4] = schroedinger?.probabilityCurrentDensityThreshold ?? 0.01
  floatView[1308 / 4] = schroedinger?.probabilityCurrentMagnitudeThreshold ?? 0.0
  const lineDensity = schroedinger?.probabilityCurrentLineDensity ?? 8.0
  const stepSize = schroedinger?.probabilityCurrentStepSize ?? 0.04
  const integrationSteps = schroedinger?.probabilityCurrentSteps ?? 20
  const isMomentum = !isUniformComputeMode && schroedinger?.representation === 'momentum'
  floatView[1312 / 4] = isMomentum ? Math.min(lineDensity, 3.0) : lineDensity
  floatView[1316 / 4] = isMomentum ? Math.max(stepSize, 0.02) : stepSize
  intView[1320 / 4] = isMomentum ? Math.min(integrationSteps, 8) : integrationSteps
  floatView[1324 / 4] = schroedinger?.probabilityCurrentOpacity ?? 0.7
}

/** Pack representation, radial probability, domain coloring, and diverging (offsets 1328-1456). */
function packRepresentationAndColorOverlays(
  floatView: Float32Array,
  intView: Int32Array,
  p: SchroedingerPackParams,
  hydrogen: HydrogenResult
): void {
  const { isUniformComputeMode, isDensityMatrixMode, quantumModeStr, schroedinger, appearance } = p

  // Representation + momentum controls (offset 1328-1344)
  const forcePosition =
    isUniformComputeMode || (isDensityMatrixMode && quantumModeStr === 'hydrogenND')
  intView[1328 / 4] = forcePosition
    ? 0
    : (REPRESENTATION_MODE_MAP[schroedinger?.representation ?? 'position'] ?? 0)
  intView[1332 / 4] = MOMENTUM_DISPLAY_MODE_MAP[schroedinger?.momentumDisplayUnits ?? 'k'] ?? 0
  floatView[1336 / 4] = p.effectiveMomentumScale
  floatView[1340 / 4] = schroedinger?.momentumHbar ?? 1.0

  // Radial probability overlay (offset 1344-1376)
  const isMomentumRep = !isUniformComputeMode && schroedinger?.representation === 'momentum'
  const radialProbEnabled = (schroedinger?.radialProbabilityEnabled ?? false) && !isMomentumRep
  intView[1344 / 4] = radialProbEnabled ? 1 : 0
  floatView[1348 / 4] = schroedinger?.radialProbabilityOpacity ?? 0.6
  floatView[1352 / 4] =
    radialProbEnabled && quantumModeStr !== 'harmonicOscillator'
      ? computeRadialProbabilityNorm(hydrogen.validN, hydrogen.validL, hydrogen.bohrRadius)
      : 1.0
  floatView[1356 / 4] = 0.0
  packColorRgba(floatView, 1360 / 4, schroedinger?.radialProbabilityColor ?? '#44aaff')

  // Domain coloring controls (offset 1376-1408)
  const domainColoring = appearance?.domainColoring
  floatView[1376 / 4] = domainColoring?.modulusMode === 'logPsiAbs' ? 1.0 : 0.0
  floatView[1380 / 4] = domainColoring?.contoursEnabled ? 1.0 : 0.0
  floatView[1384 / 4] = domainColoring?.contourDensity ?? 8.0
  floatView[1388 / 4] = domainColoring?.contourWidth ?? 0.08
  floatView[1392 / 4] = domainColoring?.contourStrength ?? 0.45
  floatView[1396 / 4] = 0.0
  floatView[1400 / 4] = 0.0
  floatView[1404 / 4] = 0.0

  // Diverging color controls (offset 1408-1456)
  packDivergingColors(floatView, appearance)
}

/** Pack diverging color palette controls (offsets 1408-1456). */
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
  floatView[1408 / 4] = divergingNeutral[0]
  floatView[1412 / 4] = divergingNeutral[1]
  floatView[1416 / 4] = divergingNeutral[2]
  floatView[1420 / 4] = usePhaseDivergingPalette
    ? 0.2
    : Math.max(0, Math.min(1, divergingPsi?.intensityFloor ?? 0.2))

  floatView[1424 / 4] = divergingPositive[0]
  floatView[1428 / 4] = divergingPositive[1]
  floatView[1432 / 4] = divergingPositive[2]
  floatView[1436 / 4] = usePhaseDivergingPalette
    ? 0.0
    : divergingPsi?.component === 'imag'
      ? 1.0
      : 0.0

  floatView[1440 / 4] = divergingNegative[0]
  floatView[1444 / 4] = divergingNegative[1]
  floatView[1448 / 4] = divergingNegative[2]
  floatView[1452 / 4] = 0.0
}

/** Pack Wigner phase-space and Pauli spinor color fields (offsets 1456-1520). */
function packWignerAndPauliFields(
  floatView: Float32Array,
  intView: Int32Array,
  p: SchroedingerPackParams
): void {
  const { schroedinger, pauliSpinor, dimension } = p

  // Wigner phase-space controls (offset 1456-1488)
  const wignerDimIdx = schroedinger?.wignerDimensionIndex ?? 0
  intView[1456 / 4] = Math.max(0, Math.min(wignerDimIdx, dimension - 1))
  intView[1460 / 4] = schroedinger?.wignerCrossTermsEnabled ? 1 : 0

  const wignerAutoRange = schroedinger?.wignerAutoRange ?? true
  if (wignerAutoRange) {
    packWignerAutoRange(floatView, intView, p, wignerDimIdx)
  } else {
    floatView[1464 / 4] = schroedinger?.wignerXRange ?? 6.0
    floatView[1468 / 4] = schroedinger?.wignerPRange ?? 6.0
  }
  intView[1472 / 4] = schroedinger?.wignerQuadPoints ?? 32
  intView[1476 / 4] = schroedinger?.wignerClassicalOverlay ? 1 : 0
  floatView[1480 / 4] = 0.0
  floatView[1484 / 4] = 0.0

  // Pauli spinor colors (offset 1488-1520)
  const spinUp = pauliSpinor?.spinUpColor ?? [0.0, 0.898, 1.0]
  const spinDown = pauliSpinor?.spinDownColor ?? [1.0, 0.0, 0.898]
  floatView[1488 / 4] = spinUp[0]!
  floatView[1492 / 4] = spinUp[1]!
  floatView[1496 / 4] = spinUp[2]!
  floatView[1500 / 4] = 0.0
  floatView[1504 / 4] = spinDown[0]!
  floatView[1508 / 4] = spinDown[1]!
  floatView[1512 / 4] = spinDown[2]!
  floatView[1516 / 4] = 0.0
}

/** Compute Wigner auto-range values based on quantum mode and state. */
function packWignerAutoRange(
  floatView: Float32Array,
  intView: Int32Array,
  p: SchroedingerPackParams,
  wignerDimIdx: number
): void {
  const { schroedinger } = p
  const isHydrogenMode = p.rendererQuantumMode === 'hydrogenND'

  if (isHydrogenMode && wignerDimIdx < 3) {
    const n = schroedinger?.principalQuantumNumber ?? 2
    const a0 = schroedinger?.bohrRadiusScale ?? 1.0
    const rCenter = n * n * a0
    const rMax = rCenter * 2.5
    const halfExtent = Math.max(rCenter, rMax - rCenter)
    floatView[1464 / 4] = halfExtent
    floatView[1468 / 4] = 3.0 / (n * a0)
    return
  }

  let selectedOmega: number
  let maxN: number
  if (isHydrogenMode && wignerDimIdx >= 3) {
    const extraIdx = wignerDimIdx - 3
    selectedOmega = floatView[640 / 4 + extraIdx] ?? 1.0
    maxN = intView[608 / 4 + extraIdx] ?? 0
  } else {
    selectedOmega = floatView[16 / 4 + Math.min(wignerDimIdx, 10)] ?? 1.0
    maxN = 0
    const tc = p.rendererTermCount ?? 1
    for (let k = 0; k < tc; k++) {
      const qn = intView[64 / 4 + k * 11 + Math.min(wignerDimIdx, 10)] ?? 0
      if (qn > maxN) maxN = qn
    }
  }
  const xScale = Math.sqrt(Math.max(2 * maxN + 1, 1) / Math.max(selectedOmega, 0.01))
  const pScale = Math.sqrt(Math.max(2 * maxN + 1, 1) * Math.max(selectedOmega, 0.01))
  floatView[1464 / 4] = xScale * 3.5
  floatView[1468 / 4] = pScale * 3.5
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

// =========================================================================
// HO momentum transform
// =========================================================================

/**
 * In-place transform of already-packed Schroedinger uniforms for HO momentum space.
 *
 * Physics: HO eigenfunctions are eigenfunctions of the Fourier transform.
 * phi_n(k, omega) = (-i)^n * phi_n(k, 1/omega).
 * This inverts omegas and applies phase rotations to coefficients so the GPU shader
 * runs the normal position-mode path and produces correct momentum-space results.
 *
 * Must be called AFTER packSchroedingerUniforms and BEFORE the buffer write.
 *
 * @param floatView - Float32 view of the Schroedinger uniform buffer
 * @param intView - Int32 view of the same buffer
 * @param dimension - Number of spatial dimensions
 * @param hbar - Reduced Planck constant (1.0 for k-space, user value for p-space)
 */
export function applyHOMomentumTransform(
  floatView: Float32Array,
  intView: Int32Array,
  dimension: number,
  hbar: number
): void {
  // 1. Invert omegas: omega_j -> 1/(hbar^2 * omega_j)
  const hbar2 = hbar * hbar
  const omegaOff = 16 / 4
  for (let j = 0; j < MAX_DIM; j++) {
    const omega = floatView[omegaOff + j]!
    floatView[omegaOff + j] = 1.0 / (hbar2 * Math.max(omega, 0.01))
  }

  // 2. Rotate coefficients by (-i)^{sum n_j} per term
  const quantumOff = 64 / 4
  const coeffOff = 416 / 4
  const termCount = Math.min(Math.max(intView[1]!, 1), MAX_TERMS)

  for (let k = 0; k < termCount; k++) {
    let totalN = 0
    for (let j = 0; j < dimension; j++) {
      totalN += intView[quantumOff + k * MAX_DIM + j]!
    }

    const re = floatView[coeffOff + k * 4]!
    const im = floatView[coeffOff + k * 4 + 1]!
    const mod = ((totalN % 4) + 4) % 4
    switch (mod) {
      case 0:
        break // x1
      case 1:
        floatView[coeffOff + k * 4] = im
        floatView[coeffOff + k * 4 + 1] = -re
        break // x(-i)
      case 2:
        floatView[coeffOff + k * 4] = -re
        floatView[coeffOff + k * 4 + 1] = -im
        break // x(-1)
      case 3:
        floatView[coeffOff + k * 4] = -im
        floatView[coeffOff + k * 4 + 1] = re
        break // x(i)
    }
  }

  // 3. Force representationMode = 0 (position) — shader runs normal path
  intView[1328 / 4] = 0
}

// =========================================================================
// Camera uniform buffer
// =========================================================================

/** All values needed to pack the camera uniform buffer (512 bytes). */
export interface CameraPackParams {
  camera: CameraSnapshot
  animationTime: number
  is2D: boolean
  transform?: TransformSnapshot
  bayerOffset: readonly [number, number]
  size: { width: number; height: number }
  frameDelta: number
  frameNumber: number
}

/**
 * Pack camera matrices, model matrix, and per-frame scalars into the camera uniform buffer.
 *
 * @param data - Float32Array(128) for the camera uniform buffer
 * @param dataView - DataView of the same buffer (for uint32 writes)
 * @param p - Camera pack parameters
 */
export function packCameraUniforms(
  data: Float32Array,
  dataView: DataView,
  p: CameraPackParams
): void {
  const { camera, animationTime, is2D, transform, bayerOffset, size, frameDelta, frameNumber } = p

  // Matrices at correct offsets (each mat4x4f = 16 floats)
  if (camera.viewMatrix) data.set(camera.viewMatrix.elements, 0)
  if (camera.projectionMatrix) data.set(camera.projectionMatrix.elements, 16)
  if (camera.viewProjectionMatrix) data.set(camera.viewProjectionMatrix.elements, 32)
  if (camera.inverseViewMatrix) data.set(camera.inverseViewMatrix.elements, 48)
  if (camera.inverseProjectionMatrix) data.set(camera.inverseProjectionMatrix.elements, 64)

  // Model matrix computation
  let scale: number
  let posX: number
  let posY: number
  let posZ: number

  if (is2D) {
    const camPos = camera.position ?? { x: 0, y: 0, z: 8 }
    const camTarget = camera.target ?? { x: 0, y: 0, z: 0 }
    const dx = camPos.x - (camTarget.x ?? 0)
    const dy = camPos.y - (camTarget.y ?? 0)
    const dz = camPos.z - (camTarget.z ?? 0)
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
    const defaultDistance = 8.0
    scale = distance > 0 ? distance / defaultDistance : 1.0
    posX = camTarget.x ?? 0
    posY = camTarget.y ?? 0
    posZ = 0
  } else {
    scale = transform?.uniformScale ?? 1.0
    const position = transform?.position ?? [0, 0, 0]
    posX = position[0] ?? 0
    posY = position[1] ?? 0
    posZ = position[2] ?? 0
  }

  // modelMatrix (offset 80, column-major)
  data[80] = scale
  data[81] = 0
  data[82] = 0
  data[83] = 0
  data[84] = 0
  data[85] = scale
  data[86] = 0
  data[87] = 0
  data[88] = 0
  data[89] = 0
  data[90] = scale
  data[91] = 0
  data[92] = posX
  data[93] = posY
  data[94] = posZ
  data[95] = 1.0

  // inverseModelMatrix (offset 96)
  const invScale = scale !== 0 ? 1.0 / scale : 1.0
  data[96] = invScale
  data[97] = 0
  data[98] = 0
  data[99] = 0
  data[100] = 0
  data[101] = invScale
  data[102] = 0
  data[103] = 0
  data[104] = 0
  data[105] = 0
  data[106] = invScale
  data[107] = 0
  data[108] = -posX * invScale
  data[109] = -posY * invScale
  data[110] = -posZ * invScale
  data[111] = 1.0

  // Camera position (offset 112)
  if (camera.position) {
    data[112] = camera.position.x
    data[113] = camera.position.y
    data[114] = camera.position.z
  }
  data[115] = camera.near || 0.1
  data[116] = camera.far || 1000
  data[117] = ((camera.fov || 50) * Math.PI) / 180 // radians
  data[118] = size.width
  data[119] = size.height
  data[120] = size.width / size.height

  // DEV diagnostic
  if (import.meta.env.DEV && camera.projectionMatrix?.elements) {
    const projAspect = camera.projectionMatrix.elements[5]! / camera.projectionMatrix.elements[0]!
    const ctxAspect = size.width / size.height
    if (Math.abs(projAspect - ctxAspect) > 0.01) {
      logger.warn(
        `[Schrodinger] ASPECT MISMATCH! projection: ${projAspect.toFixed(4)}, ctx.size: ${ctxAspect.toFixed(4)} (${size.width}x${size.height})`
      )
    }
  }

  data[121] = animationTime
  data[122] = frameDelta
  dataView.setUint32(123 * 4, frameNumber, true)

  data[124] = bayerOffset[0]
  data[125] = bayerOffset[1]
  data[126] = 0
  data[127] = 0
}

// =========================================================================
// Material uniform buffer
// =========================================================================

/** All values needed to pack the material uniform buffer (160 bytes). */
export interface MaterialPackParams {
  appearance: AppearanceStoreState | undefined
  pbr: PBRSliceState | undefined
}

/**
 * Pack PBR material parameters into the material uniform buffer.
 *
 * @param data - Float32Array(40) for the material uniform buffer
 * @param dataView - DataView of the same buffer (for uint32 writes)
 * @param p - Material pack parameters
 */
export function packMaterialUniforms(
  data: Float32Array,
  dataView: DataView,
  p: MaterialPackParams
): void {
  const { appearance, pbr } = p

  // baseColor: vec4f (idx 0-3)
  const faceColor = parseColor(appearance?.faceColor ?? '#ffffff')
  data[0] = faceColor[0]
  data[1] = faceColor[1]
  data[2] = faceColor[2]
  data[3] = 1.0

  // metallic, roughness, reflectance, ao (idx 4-7)
  data[4] = pbr?.face?.metallic ?? 0.0
  data[5] = pbr?.face?.roughness ?? 0.5
  data[6] = pbr?.face?.reflectance ?? 0.5
  data[7] = 1.0

  // emissive + emissiveIntensity (idx 8-11)
  const faceEmission = appearance?.faceEmission ?? 0.0
  data[8] = faceColor[0]
  data[9] = faceColor[1]
  data[10] = faceColor[2]
  data[11] = faceEmission

  // ior, transmission, thickness (idx 12-14)
  data[12] = pbr?.face?.ior ?? 1.5
  data[13] = pbr?.face?.transmission ?? 0.0
  data[14] = pbr?.face?.thickness ?? 1.0

  // sssEnabled: u32 (idx 15)
  const sssEnabled = appearance?.sssEnabled ?? false
  dataView.setUint32(15 * 4, sssEnabled ? 1 : 0, true)

  // sssIntensity (idx 16)
  data[16] = appearance?.sssIntensity ?? 1.0

  // sssColor: vec3f (idx 20-22, aligned to byte 80)
  const sssColor = parseColor(appearance?.sssColor ?? '#ff8844')
  data[20] = sssColor[0]
  data[21] = sssColor[1]
  data[22] = sssColor[2]

  // sssThickness, sssJitter (idx 23-24)
  data[23] = appearance?.sssThickness ?? 1.0
  data[24] = appearance?.sssJitter ?? 0.2

  // Reserved (Fresnel rim removed, idx 25-31)
  data[25] = 0.0
  data[26] = 0.0
  data[28] = 0.0
  data[29] = 0.0
  data[30] = 0.0
  data[31] = 0.0

  // specularIntensity (idx 32)
  data[32] = pbr?.face?.specularIntensity ?? 0.8

  // specularColor: vec3f (idx 36-38, aligned to byte 144)
  const specularColor = parseColor(pbr?.face?.specularColor ?? '#ffffff')
  data[36] = specularColor[0]
  data[37] = specularColor[1]
  data[38] = specularColor[2]
}

// =========================================================================
// Quality uniform buffer
// =========================================================================

/**
 * Pack quality/performance parameters into the quality uniform buffer.
 *
 * @param data - Float32Array(12) for the quality uniform buffer
 * @param dataView - DataView of the same buffer (for int32 writes)
 * @param qualityMultiplier - Current quality multiplier (0.0-1.0+)
 */
export function packQualityUniforms(
  data: Float32Array,
  dataView: DataView,
  qualityMultiplier: number
): void {
  data[1] = 0.001 / qualityMultiplier
  data[3] = 0
  data[6] = 0
  data[7] = 0
  data[8] = qualityMultiplier

  dataView.setInt32(0 * 4, Math.floor(128 * qualityMultiplier), true)
  dataView.setInt32(2 * 4, 0, true)
  dataView.setInt32(4 * 4, 0, true)
  dataView.setInt32(5 * 4, 0, true)
  dataView.setInt32(9 * 4, 0, true)
}

// =========================================================================
// Basis vectors uniform buffer
// =========================================================================

/** All values needed to pack the basis vectors uniform buffer (192 bytes). */
export interface BasisPackParams {
  dimension: number
  basisX?: Float32Array
  basisY?: Float32Array
  basisZ?: Float32Array
  origin?: Float32Array
  sliceAnimationEnabled: boolean
  sliceSpeed: number
  sliceAmplitude: number
  accumulatedTime: number
}

/** Golden ratio for incommensurate phase offsets in slice animation. */
const PHI = 1.618033988749895

/**
 * Pack N-dimensional basis vectors and origin into the basis uniform buffer.
 *
 * @param data - Float32Array(48) for the basis uniform buffer
 * @param p - Basis pack parameters
 */
export function packBasisVectors(data: Float32Array, p: BasisPackParams): void {
  const STRIDE = 12

  // Zero-fill for clean slate
  data.fill(0)

  // Default basis vectors (identity for first 3 dims)
  data[0] = 1.0 // X: [1, 0, 0, ...]
  data[STRIDE + 1] = 1.0 // Y: [0, 1, 0, ...]
  data[STRIDE * 2 + 2] = 1.0 // Z: [0, 0, 1, ...]

  // Override with stored basis
  if (p.basisX) {
    for (let i = 0; i < Math.min(p.basisX.length, MAX_DIM); i++) {
      data[i] = p.basisX[i] ?? 0
    }
  }
  if (p.basisY) {
    for (let i = 0; i < Math.min(p.basisY.length, MAX_DIM); i++) {
      data[STRIDE + i] = p.basisY[i] ?? 0
    }
  }
  if (p.basisZ) {
    for (let i = 0; i < Math.min(p.basisZ.length, MAX_DIM); i++) {
      data[STRIDE * 2 + i] = p.basisZ[i] ?? 0
    }
  }

  // Origin (rotated N-D point from store)
  const originOffset = STRIDE * 3
  if (p.origin) {
    for (let i = 0; i < Math.min(p.origin.length, MAX_DIM); i++) {
      data[originOffset + i] = p.origin[i] ?? 0
    }
  }

  // Slice animation: time-varying offset on extra dimensions (4D+)
  if (p.sliceAnimationEnabled && p.dimension > 3) {
    for (let i = 3; i < Math.min(p.dimension, MAX_DIM); i++) {
      const extraDimIndex = i - 3
      const phase = extraDimIndex * PHI
      const t1 = p.accumulatedTime * p.sliceSpeed * 2 * Math.PI + phase
      const t2 = p.accumulatedTime * p.sliceSpeed * 1.3 * 2 * Math.PI + phase * 1.5
      const offset = p.sliceAmplitude * (0.7 * Math.sin(t1) + 0.3 * Math.sin(t2))
      data[originOffset + i] = (data[originOffset + i] ?? 0) + offset
    }
  }
}

// =========================================================================
// Canonical density compensation
// =========================================================================

/**
 * Compute the auto-compensation factor for canonical HO normalization.
 *
 * Evaluates the peak |psi|^2 of the dominant superposition term using
 * physicists' Hermite polynomials, then derives a densityGain multiplier
 * so that the default gain=2.0 produces alpha ~0.7 at peak density.
 *
 * @param preset - The quantum preset with coefficients and quantum numbers
 * @param dimension - Number of spatial dimensions
 * @param boundingRadius - Current bounding radius (for step length estimate)
 * @returns Object with `compensation` factor and `peakDensity` value
 */
export function computeCanonicalCompensation(
  preset: QuantumPreset,
  dimension: number,
  boundingRadius: number
): { compensation: number; peakDensity: number } {
  // Physicists' Hermite polynomial coefficients H_n(u), stored as [u^0, u^1, ..., u^6]
  const HERMITE_COEFFS: number[][] = [
    [1], // H_0
    [0, 2], // H_1
    [-2, 0, 4], // H_2
    [0, -12, 0, 8], // H_3
    [12, 0, -48, 0, 16], // H_4
    [0, 120, 0, -160, 0, 32], // H_5
    [-120, 0, 720, 0, -480, 0, 64], // H_6
  ]
  const FACTORIALS = [1, 1, 2, 6, 24, 120, 720]

  if (preset.termCount === 0) return { compensation: 1.0, peakDensity: 0.1 }

  // Find the dominant term (largest |c_k|^2)
  let dominantIdx = 0
  let maxCoeffMag = 0
  for (let k = 0; k < preset.termCount; k++) {
    const coeff = preset.coefficients[k]
    if (!coeff) continue
    const [cRe, cIm] = coeff
    const mag = cRe * cRe + cIm * cIm
    if (mag > maxCoeffMag) {
      maxCoeffMag = mag
      dominantIdx = k
    }
  }

  const qn = preset.quantumNumbers[dominantIdx]
  if (!qn) return { compensation: 1.0, peakDensity: 0.1 }
  const dim = Math.min(dimension, qn.length)

  // Compute peak |psi|^2 = |c_dominant|^2 * prod_i peak_1D(n_i, omega_i)
  let peakDensity = maxCoeffMag
  for (let j = 0; j < dim; j++) {
    const nRaw = qn[j]
    if (nRaw == null) continue
    const n = Math.max(0, Math.min(6, Math.round(nRaw)))
    const omega = Math.max(preset.omega[j] ?? 1.0, 0.01)
    const coeffs = HERMITE_COEFFS[n]
    if (!coeffs) continue

    // Find max of H_n^2(u) * exp(-u^2) numerically over u in [0, 5]
    let maxHermiteSq = 0
    for (let i = 0; i <= 500; i++) {
      const u = (i / 500) * 5.0
      let hn = 0
      for (let k = coeffs.length - 1; k >= 0; k--) {
        hn = hn * u + (coeffs[k] ?? 0)
      }
      const val = hn * hn * Math.exp(-u * u)
      if (val > maxHermiteSq) maxHermiteSq = val
    }

    const factorial = FACTORIALS[n] ?? 1
    const twoN_nFact = Math.pow(2, n) * factorial
    const peak1D = (Math.sqrt(omega / Math.PI) / twoN_nFact) * maxHermiteSq
    peakDensity *= peak1D
  }

  if (peakDensity <= 0) return { compensation: 1.0, peakDensity: 0.1 }

  const TARGET_ALPHA = 0.7
  const DEFAULT_DENSITY_GAIN = 2.0
  const TYPICAL_SAMPLES = 32
  const estimatedStepLen = (2 * boundingRadius) / TYPICAL_SAMPLES
  const neededGain = -Math.log(1 - TARGET_ALPHA) / (peakDensity * estimatedStepLen)

  return {
    compensation: neededGain / DEFAULT_DENSITY_GAIN,
    peakDensity,
  }
}
