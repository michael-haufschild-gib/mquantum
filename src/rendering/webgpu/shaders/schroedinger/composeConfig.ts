/**
 * Schrödinger shader configuration, flag derivation, and define generation.
 *
 * Extracted from compose.ts to keep the shader composer under 300 lines.
 * This module handles:
 * - Shader config type definitions
 * - Deriving boolean flags from config
 * - Building WGSL compile-time defines and human-readable feature tags
 * - Selecting the main entry-point shader block
 *
 * @module rendering/webgpu/shaders/schroedinger/composeConfig
 */

import type { SchroedingerConfig } from '@/lib/geometry/extended/types'

import {
  sanitizeShaderBoolean,
  sanitizeShaderDimension,
  sanitizeShaderInteger,
  sanitizeShaderTermCount,
  type ShaderTermCount,
  type WGSLShaderConfig,
} from '../shared/compose-helpers'
import {
  generateMainBlockIsosurface,
  generateMainBlockIsosurfaceTemporal,
  generateMainBlockTemporal,
  generateMainBlockVolumetric,
  PHASE_COLOR_ALGS,
} from './main.wgsl'
import { generateMainBlock2D, generateMainBlock2DIsolines } from './main2D.wgsl'
import { generateMainBlockWigner2D } from './mainWigner2D.wgsl'
import { NODAL_DEFINITION_MAP, NODAL_FAMILY_MAP, NODAL_RENDER_MODE_MAP } from './temporalJitter'
import { COLOR_ALGORITHM_INDICES } from './volume/emissionConstants'

/** Quantum physics mode for Schrödinger visualization */
export type QuantumModeForShader = 'harmonicOscillator' | 'hydrogenND' | 'hydrogenNDCoupled'

const DEFAULT_COLOR_ALGORITHM = 4
const DEFAULT_DENSITY_GRID_SIZE = 64
const COLOR_ALGORITHM_SET = new Set<number>(COLOR_ALGORITHM_INDICES)

/** Restrict shader quantum mode selection to supported analytical modes. */
export function sanitizeQuantumModeForShader(mode: unknown): QuantumModeForShader {
  return mode === 'hydrogenND' || mode === 'hydrogenNDCoupled' ? mode : 'harmonicOscillator'
}

/** Restrict color algorithm specialization to known finite shader branches. */
export function sanitizeShaderColorAlgorithm(value: unknown): number {
  const algorithm = sanitizeShaderInteger(value, DEFAULT_COLOR_ALGORITHM)
  return COLOR_ALGORITHM_SET.has(algorithm) ? algorithm : DEFAULT_COLOR_ALGORITHM
}

/** Restrict density-grid size constants to finite positive integer literals. */
export function sanitizeShaderDensityGridSize(value: unknown): number {
  return sanitizeShaderInteger(value, DEFAULT_DENSITY_GRID_SIZE, { min: 1, max: 4096 })
}

/**
 * Schrödinger shader configuration options.
 */
export interface SchroedingerWGSLShaderConfig extends WGSLShaderConfig {
  /** Use isosurface mode instead of volumetric */
  isosurface?: boolean
  /** Use temporal accumulation */
  temporalAccumulation?: boolean
  /** Use density-grid sampling for volumetric raymarching */
  useDensityGrid?: boolean
  /** Whether the density grid texture has phase data (rgba16float vs r16float) */
  densityGridHasPhase?: boolean
  /** Density grid resolution (e.g. 64 or 128) for gradient step size calculation */
  densityGridSize?: number
  /** Quantum mode */
  quantumMode?: QuantumModeForShader
  /** Number of HO superposition terms (1-8) */
  termCount?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  /** Compile-time color algorithm specialization (defaults to Mixed) */
  colorAlgorithm?: number
  /** Compile-time specialization for phase materiality branching. */
  phaseMateriality?: boolean
  /** Compile-time specialization for interference branching. */
  interference?: boolean
  /** Use 1D eigenfunction cache for HO mode (replaces inline ho1D + tetrahedral gradient). */
  useEigenfunctionCache?: boolean
  /** Explicitly enable analytical gradient path when cache is active (HO only). */
  useAnalyticalGradient?: boolean
  /** Enable robust eigencache interpolation/extrapolation policy when cache is active. */
  useRobustEigenInterpolation?: boolean
  /** Compile-time specialization for uncertainty boundary emphasis. */
  uncertaintyBoundary?: boolean
  /** Compile-time gate for nodal enum specialization. */
  nodalSpecializationEnabled?: boolean
  /** Compile-time nodal scalar definition specialization. */
  nodalDefinition?: SchroedingerConfig['nodalDefinition']
  /** Compile-time nodal render-mode specialization. */
  nodalRenderMode?: SchroedingerConfig['nodalRenderMode']
  /** Compile-time nodal family-filter specialization. */
  nodalFamilyFilter?: SchroedingerConfig['nodalFamilyFilter']
  /** Wigner phase-space mode — forces 2D pipeline with phase-space evaluation. */
  isWigner?: boolean
  /** Use pre-computed Wigner cache texture instead of inline evaluation. */
  useWignerCache?: boolean
  /**
   * Compute mode flag — true for every mode that writes into the density
   * grid (FSF, TDSE, BEC, Dirac, QuantumWalk, Pauli, Wheeler–DeWitt).
   * Gates: cube (not sphere) bounding-volume intersection, negative-A
   * potential-overlay path, and the "no inline fallback" safety branch.
   * Historically named `isFreeScalar` and conflated with the "true FSF"
   * semantic, which mis-typed WdW as binary-sign-phase and broke the
   * diverging Re/Im algorithm. The two are now separate.
   */
  isFreeScalar?: boolean
  /**
   * Strictly true for the free-scalar-field mode (`quantumMode ===
   * 'freeScalarField'`). Only this mode writes binary-sign phase
   * `{0, π}` — the diverging color algorithm must use `cos(phase)` to
   * extract the sign rather than `sin(phase)` (see HAS_BINARY_SIGN_PHASE).
   * WdW writes continuous `atan2(im, re)` and must NOT be in this set.
   */
  isFreeScalarField?: boolean
  /** Compute mode has a pre-computed normal grid texture at binding 7. */
  hasPrecomputedNormals?: boolean
  /** Quantum walk mode — discrete lattice, density brightness uses linear rho. */
  isQuantumWalk?: boolean
  /** Pauli spinor mode — alpha encodes density, not potential. */
  isPauli?: boolean
  /** Bell-pair mode — density texture holds a static apparatus pattern modulated by live |S|. */
  isBellPair?: boolean
  /**
   * AdS (anti-de Sitter) mode. Rides on the shared Schrödinger shader
   * composition path, so the top-level `quantumMode` is narrowed to
   * `'harmonicOscillator'` by `rendererConfigUtils` even for AdS. This
   * separate flag lets the composer emit AdS-specific compile-time
   * constants (currently: the binary-sign-phase fallback in color
   * algorithm 9). Leave `false` for every non-AdS mode.
   */
  isAds?: boolean
  /** Include analysis texture bindings for free-scalar educational color modes. */
  freeScalarAnalysis?: boolean
  /** Density matrix mode (open quantum) — disables inline wavefunction fallback. */
  useDensityMatrix?: boolean
  /** Compile-time gate for cross-section slice (default: true). */
  crossSectionEnabled?: boolean
  /** Compile-time gate for probability current j-field (default: true). */
  probabilityCurrentEnabled?: boolean
  /** Compile-time dependency for hydrogen radial-probability overlay. */
  radialProbabilityEnabled?: boolean
  /** Compile-time dependency for Born-Null Weave (inline HQ raymarch only). */
  bornNullWeaveEnabled?: boolean
  /**
   * Compile-time dependency for phase-shimmer noise. Modulates rho by
   * time-varying gradient noise; in gridOnly the density grid bakes the
   * pattern frozen, so the toggle must force the inline raymarch path.
   */
  phaseShimmerEnabled?: boolean
  /**
   * Compile-time dependency for hydrogen phase animation. Multiplies the
   * wavefunction phase by exp(-i E t); in gridOnly the grid bakes the
   * phase frozen, so the toggle must force the inline raymarch path.
   */
  phaseAnimationEnabled?: boolean
  /** Use ambient-only emission in grid-only compute raymarchers. */
  fastGridEmission?: boolean
  /** Compile-time gate for probability-stress optical metric branches. */
  quantumBackreactionLensing?: boolean
  /** Compile-time gate for bilocal ER bridge branches. */
  bilocalERBridge?: boolean
  /** Compile-time gate for entropy-gradient time-shear branches. */
  entropicTimeShear?: boolean
  /** Compile-time gate for spectral-dimension flow branches. */
  spectralDimensionFlow?: boolean
  /** Compile-time gate for false-vacuum bubble lens branches. */
  vacuumBubbleLens?: boolean
  /** Compile-time gate for TDSE/Dirac negative-alpha potential overlays. */
  negativeAlphaPotentialOverlay?: boolean
  /** Compile-time gate for Wheeler-DeWitt positive-alpha overlays. */
  wdwOverlay?: boolean
  /** Compile-time gate for TDSE branch-color mixing. */
  tdseBranchColor?: boolean
  /** Compile-time gate for AdS amplitude growth in density-grid raymarching. */
  adsAmplitude?: boolean
  /** Compile-time gate for WdW/AdS phase rotation in density-grid raymarching. */
  gridPhaseOffset?: boolean
  /** Apply basis-vector rotation to density grid sample positions (AdS modes). */
  sampleSpaceRotation?: boolean
  /**
   * Profiling strip flags — compile out specific hot-path components to measure
   * their actual GPU cost via A/B benchmarking. Each flag replaces the real
   * computation with a cheap constant, preserving the shader structure.
   */
  profilingStrip?: {
    /** Replace gradient (6 texture fetches) with constant up-normal */
    gradient?: boolean
    /** Replace emission+lighting with flat baseColor (no per-light loop) */
    lighting?: boolean
    /** Disable empty-skip (force every sample to evaluate) */
    emptySkip?: boolean
    /** Disable adaptive stepping (force stepMultiplier=1) */
    adaptiveStep?: boolean
    /** Cap MAX_VOLUME_SAMPLES at 64 instead of 128 */
    halfSamples?: boolean
    /** Skip alpha compositing entirely (no gradient, no emission, no color accumulation) */
    compositing?: boolean
  }
}

/** Derived boolean flags from shader config. */
export interface DerivedShaderFlags {
  is2D: boolean
  isHydrogenFamily: boolean
  isHydrogenCoupled: boolean
  actualDim: number
  includeHydrogen: boolean
  includeHydrogenND: boolean
  includeHarmonic: boolean
  hydrogenNDDimension: number
  useUnrolledHO: boolean
  termCount: ShaderTermCount | undefined
  useCache: boolean
  useAnalyticalGradient: boolean
  useRobustEigenInterpolation: boolean
  isDualChannel: boolean
  needsCosine: boolean
  needsOklab: boolean
  usePrecomputedNormals: boolean
  /** Strictly true for the free-scalar-field mode; see composeConfig
   *  field doc for the binary-sign-phase rationale. Defaults to false. */
  isFreeScalarField: boolean
}

/**
 * Derive boolean shader flags from the shader config.
 * @param config - Shader configuration
 */
export function derivedShaderFlags(config: SchroedingerWGSLShaderConfig): DerivedShaderFlags {
  const { dimension, termCount } = config
  const quantumMode = sanitizeQuantumModeForShader(config.quantumMode)
  const colorAlgorithm = sanitizeShaderColorAlgorithm(config.colorAlgorithm)
  const useEigenfunctionCache = sanitizeShaderBoolean(config.useEigenfunctionCache, false)
  const useAnalyticalGradientFlag = sanitizeShaderBoolean(config.useAnalyticalGradient, true)
  const useRobustEigenInterpolationFlag = sanitizeShaderBoolean(
    config.useRobustEigenInterpolation,
    true
  )
  const isWigner = sanitizeShaderBoolean(config.isWigner, false)
  const isFreeScalar = sanitizeShaderBoolean(config.isFreeScalar, false)
  const isFreeScalarField = sanitizeShaderBoolean(config.isFreeScalarField, false)
  const useDensityGrid = sanitizeShaderBoolean(config.useDensityGrid, false)
  const actualDim = sanitizeShaderDimension(dimension, {
    min: isWigner ? 3 : 2,
    fallback: 3,
  })
  const is2D = actualDim === 2 || isWigner
  const isHydrogenFamily = quantumMode === 'hydrogenND' || quantumMode === 'hydrogenNDCoupled'
  const isHydrogenCoupled = quantumMode === 'hydrogenNDCoupled'
  const includeHydrogen = isHydrogenFamily
  const includeHydrogenND = isHydrogenFamily
  const includeHarmonic = !isHydrogenFamily
  const hydrogenNDDimension = includeHydrogenND ? actualDim : 0
  const shaderTermCount = sanitizeShaderTermCount(termCount)
  const useUnrolledHO = includeHarmonic && shaderTermCount !== undefined
  const useCache = useEigenfunctionCache && !is2D
  const useAnalyticalGradient = useCache && includeHarmonic && useAnalyticalGradientFlag
  const useRobustEigenInterpolation = useCache && useRobustEigenInterpolationFlag
  const isDualChannel = [23, 24, 25].includes(colorAlgorithm)
  const needsCosine = [1, 2].includes(colorAlgorithm)
  const needsOklab = [0, 6].includes(colorAlgorithm)
  // Pre-computed normal grid: available for analytical modes (always) and any
  // compute mode that explicitly sets hasPrecomputedNormals (FSF has it).
  const usePrecomputedNormals =
    useDensityGrid && (!isFreeScalar || sanitizeShaderBoolean(config.hasPrecomputedNormals, false))
  return {
    is2D,
    isHydrogenFamily,
    isHydrogenCoupled,
    actualDim,
    includeHydrogen,
    includeHydrogenND,
    includeHarmonic,
    hydrogenNDDimension,
    useUnrolledHO,
    termCount: shaderTermCount,
    useCache,
    useAnalyticalGradient,
    useRobustEigenInterpolation,
    isDualChannel,
    needsCosine,
    needsOklab,
    usePrecomputedNormals,
    isFreeScalarField,
  }
}

/** Build WGSL compile-time defines and human-readable feature tags. */
export function buildShaderDefinesAndFeatures(flags: {
  dimension: number
  actualDim: number
  is2D: boolean
  isWigner: boolean
  enableTemporal: boolean
  includeHydrogen: boolean
  includeHydrogenND: boolean
  hydrogenNDDimension: number
  useUnrolledHO: boolean
  termCount: ShaderTermCount | undefined
  useCache: boolean
  useAnalyticalGradient: boolean
  useRobustEigenInterpolation: boolean
  quantumMode: string
  isosurface: boolean
  nodal: boolean
  nodalSpecializationEnabled?: boolean
  nodalDefinition?: SchroedingerConfig['nodalDefinition']
  nodalRenderMode?: SchroedingerConfig['nodalRenderMode']
  nodalFamilyFilter?: SchroedingerConfig['nodalFamilyFilter']
  phaseMateriality: boolean
  interference: boolean
  uncertaintyBoundary: boolean
  colorAlgorithm: number
  isDualChannel: boolean
  useDensityGrid: boolean
  densityGridHasPhase: boolean
  densityGridSize: number
  isFreeScalar: boolean
  isFreeScalarField: boolean
  usePrecomputedNormals: boolean
  isQuantumWalk: boolean
  isPauli: boolean
  isBellPair?: boolean
  isAds: boolean
  useWignerCache: boolean
  crossSectionEnabled: boolean
  probabilityCurrentEnabled: boolean
  fastGridEmission?: boolean
  quantumBackreactionLensing?: boolean
  bilocalERBridge?: boolean
  entropicTimeShear?: boolean
  spectralDimensionFlow?: boolean
  vacuumBubbleLens?: boolean
  negativeAlphaPotentialOverlay?: boolean
  wdwOverlay?: boolean
  tdseBranchColor?: boolean
  adsAmplitude?: boolean
  gridPhaseOffset?: boolean
  sampleSpaceRotation?: boolean
  profilingStrip?: SchroedingerWGSLShaderConfig['profilingStrip']
}): { defines: string[]; features: string[] } {
  const defines: string[] = []
  const features: string[] = []
  const is2D = sanitizeShaderBoolean(flags.is2D, false)
  const isWigner = sanitizeShaderBoolean(flags.isWigner, false)
  const enableTemporal = sanitizeShaderBoolean(flags.enableTemporal, false)
  const useCache = sanitizeShaderBoolean(flags.useCache, false)
  const useAnalyticalGradient = sanitizeShaderBoolean(flags.useAnalyticalGradient, false)
  const useRobustEigenInterpolation = sanitizeShaderBoolean(
    flags.useRobustEigenInterpolation,
    false
  )
  const isosurface = sanitizeShaderBoolean(flags.isosurface, false)
  const nodal = sanitizeShaderBoolean(flags.nodal, true)
  const nodalSpecializationEnabled = sanitizeShaderBoolean(flags.nodalSpecializationEnabled, false)
  const phaseMateriality = sanitizeShaderBoolean(flags.phaseMateriality, true)
  const interference = sanitizeShaderBoolean(flags.interference, true)
  const uncertaintyBoundary = sanitizeShaderBoolean(flags.uncertaintyBoundary, true)
  const isDualChannel = sanitizeShaderBoolean(flags.isDualChannel, false)
  const useDensityGrid = sanitizeShaderBoolean(flags.useDensityGrid, false)
  const densityGridHasPhase = sanitizeShaderBoolean(flags.densityGridHasPhase, false)
  const densityGridSize = sanitizeShaderDensityGridSize(flags.densityGridSize)
  const colorAlgorithm = sanitizeShaderColorAlgorithm(flags.colorAlgorithm)
  const isFreeScalar = sanitizeShaderBoolean(flags.isFreeScalar, false)
  const isFreeScalarField = sanitizeShaderBoolean(flags.isFreeScalarField, false)
  const usePrecomputedNormals = sanitizeShaderBoolean(flags.usePrecomputedNormals, false)
  const isQuantumWalk = sanitizeShaderBoolean(flags.isQuantumWalk, false)
  const isPauli = sanitizeShaderBoolean(flags.isPauli, false)
  const isAds = sanitizeShaderBoolean(flags.isAds, false)
  const useWignerCache = sanitizeShaderBoolean(flags.useWignerCache, false)
  const crossSectionEnabled = sanitizeShaderBoolean(flags.crossSectionEnabled, true)
  const probabilityCurrentEnabled = sanitizeShaderBoolean(flags.probabilityCurrentEnabled, true)
  const fastGridEmission = sanitizeShaderBoolean(flags.fastGridEmission, false)
  const featureQuantumBackreaction = sanitizeShaderBoolean(flags.quantumBackreactionLensing, true)
  const featureBilocalBridge = sanitizeShaderBoolean(flags.bilocalERBridge, true)
  const featureEntropicShear = sanitizeShaderBoolean(flags.entropicTimeShear, true)
  const featureSpectralFlow = sanitizeShaderBoolean(flags.spectralDimensionFlow, true)
  const featureVacuumBubble = sanitizeShaderBoolean(flags.vacuumBubbleLens, true)
  const featureNegativeAlphaPotentialOverlay = sanitizeShaderBoolean(
    flags.negativeAlphaPotentialOverlay,
    true
  )
  const featureWdwOverlay = sanitizeShaderBoolean(flags.wdwOverlay, true)
  const featureTdseBranchColor = sanitizeShaderBoolean(flags.tdseBranchColor, true)
  const featureAdsAmplitude = sanitizeShaderBoolean(flags.adsAmplitude, true)
  const featureGridPhaseOffset = sanitizeShaderBoolean(flags.gridPhaseOffset, true)
  const sampleSpaceRotation = sanitizeShaderBoolean(flags.sampleSpaceRotation, false)
  const strip = flags.profilingStrip

  // Only ACTUAL_DIM (clamped) is emitted — the previously-emitted
  // un-clamped `const DIMENSION` was never read by any WGSL shader.
  // Dropped to avoid misleading readers about which dimension the
  // shaders actually use. See compose.ts / composeWignerCache.ts for
  // the same note in the sibling composers.
  defines.push(`const ACTUAL_DIM: i32 = ${flags.actualDim};`)
  defines.push(`const IS_2D: bool = ${is2D};`)
  defines.push(`const IS_WIGNER: bool = ${isWigner};`)
  features.push(`${flags.actualDim}D Quantum`)

  if (enableTemporal) {
    defines.push('const TEMPORAL_ENABLED: bool = true;')
    features.push('Temporal Accumulation')
  } else {
    defines.push('const TEMPORAL_ENABLED: bool = false;')
  }

  defines.push('const SKIP_DENSITY_EMPHASIS: bool = false;')
  defines.push(`const HYDROGEN_MODE_ENABLED: bool = ${flags.includeHydrogen};`)
  if (flags.includeHydrogenND) {
    defines.push('const HYDROGEN_ND_MODE_ENABLED: bool = true;')
    defines.push(`const HYDROGEN_ND_DIMENSION: i32 = ${flags.hydrogenNDDimension};`)
  } else {
    defines.push('const HYDROGEN_ND_MODE_ENABLED: bool = false;')
  }

  if (flags.useUnrolledHO && flags.termCount) {
    defines.push('const HO_UNROLLED: bool = true;')
    defines.push(`const HO_TERM_COUNT: i32 = ${flags.termCount};`)
  } else {
    defines.push('const HO_UNROLLED: bool = false;')
  }

  if (useCache) {
    defines.push('const USE_EIGENFUNCTION_CACHE: bool = true;')
    features.push('Eigenfunction Cache')
  } else {
    defines.push('const USE_EIGENFUNCTION_CACHE: bool = false;')
  }
  defines.push(`const USE_ANALYTICAL_GRADIENT: bool = ${useAnalyticalGradient};`)
  defines.push(`const USE_ROBUST_EIGEN_INTERPOLATION: bool = ${useRobustEigenInterpolation};`)
  defines.push(`const FEATURE_RADIAL_PROBABILITY: bool = ${flags.includeHydrogen};`)
  defines.push(`const FEATURE_CROSS_SECTION: bool = ${crossSectionEnabled};`)
  defines.push(`const FEATURE_PROBABILITY_CURRENT: bool = ${probabilityCurrentEnabled};`)
  defines.push(`const FAST_GRID_EMISSION: bool = ${fastGridEmission};`)
  defines.push(`const FEATURE_QUANTUM_BACKREACTION_LENSING: bool = ${featureQuantumBackreaction};`)
  defines.push(`const FEATURE_BILOCAL_ER_BRIDGE: bool = ${featureBilocalBridge};`)
  defines.push(`const FEATURE_ENTROPIC_TIME_SHEAR: bool = ${featureEntropicShear};`)
  defines.push(`const FEATURE_SPECTRAL_DIMENSION_FLOW: bool = ${featureSpectralFlow};`)
  defines.push(`const FEATURE_VACUUM_BUBBLE_LENS: bool = ${featureVacuumBubble};`)
  defines.push(
    `const FEATURE_NEGATIVE_ALPHA_POTENTIAL_OVERLAY: bool = ${featureNegativeAlphaPotentialOverlay};`
  )
  defines.push(`const FEATURE_WDW_OVERLAY: bool = ${featureWdwOverlay};`)
  defines.push(`const FEATURE_TDSE_BRANCH_COLOR: bool = ${featureTdseBranchColor};`)
  defines.push(`const FEATURE_ADS_AMPLITUDE: bool = ${featureAdsAmplitude};`)
  defines.push(`const FEATURE_GRID_PHASE_OFFSET: bool = ${featureGridPhaseOffset};`)

  if (flags.quantumMode === 'hydrogenNDCoupled') {
    defines.push('const QUANTUM_MODE_DEFAULT: i32 = 2;')
    features.push('Hydrogen ND (Coupled)')
  } else if (flags.quantumMode === 'hydrogenND') {
    defines.push('const QUANTUM_MODE_DEFAULT: i32 = 1;')
    features.push('Hydrogen ND')
  } else {
    defines.push('const QUANTUM_MODE_DEFAULT: i32 = 0;')
    features.push('Harmonic Oscillator')
  }

  if (isWigner) {
    features.push('Wigner Phase-Space Mode')
  } else if (is2D) {
    features.push(isosurface ? '2D Isolines Mode' : '2D Heatmap Mode')
  } else if (isosurface) {
    features.push('Isosurface Mode')
  } else {
    features.push('Volumetric Mode')
  }

  if (!is2D) features.push('Beer-Lambert')

  defines.push(`const FEATURE_NODAL: bool = ${nodal};`)
  defines.push(`const NODAL_SPECIALIZATION_ENABLED: bool = ${nodalSpecializationEnabled};`)
  defines.push(
    `const NODAL_SPECIALIZED_DEFINITION: i32 = ${
      NODAL_DEFINITION_MAP[flags.nodalDefinition ?? 'psiAbs'] ?? NODAL_DEFINITION_MAP.psiAbs
    };`
  )
  defines.push(
    `const NODAL_SPECIALIZED_RENDER_MODE: i32 = ${
      NODAL_RENDER_MODE_MAP[flags.nodalRenderMode ?? 'band'] ?? NODAL_RENDER_MODE_MAP.band
    };`
  )
  defines.push(
    `const NODAL_SPECIALIZED_FAMILY_FILTER: i32 = ${
      NODAL_FAMILY_MAP[flags.nodalFamilyFilter ?? 'all'] ?? NODAL_FAMILY_MAP.all
    };`
  )
  defines.push(`const FEATURE_PHASE_MATERIALITY: bool = ${phaseMateriality};`)
  defines.push(`const FEATURE_INTERFERENCE: bool = ${interference};`)
  defines.push(`const FEATURE_UNCERTAINTY_BOUNDARY: bool = ${uncertaintyBoundary};`)
  defines.push(`const COLOR_ALGORITHM: i32 = ${colorAlgorithm};`)
  defines.push(`const IS_DUAL_CHANNEL: bool = ${isDualChannel};`)
  defines.push(`const USE_DENSITY_GRID: bool = ${useDensityGrid};`)
  defines.push(`const DENSITY_GRID_HAS_PHASE: bool = ${densityGridHasPhase};`)
  defines.push(`const DENSITY_GRID_SIZE: f32 = ${densityGridSize}.0;`)
  defines.push(`const IS_FREE_SCALAR: bool = ${isFreeScalar};`)
  defines.push(`const IS_QUANTUM_WALK: bool = ${isQuantumWalk};`)
  defines.push(`const IS_PAULI: bool = ${isPauli};`)
  // Binary-sign phase: ONLY the free-scalar-field mode (not all compute
  // modes), Wigner, and AdS write phase = {0, π} based on sign(field).
  // Phase-based color algorithms that extract the sign via `sin(phase)`
  // (e.g. algorithm 9 Diverging with useImag = true) see ≈ 0 for both
  // values and produce no signal. The algorithms gate on this const to
  // fall back to `cos(phase)` extraction for binary-phase modes, which
  // correctly recovers the sign as ±1. WdW writes continuous
  // `atan2(im, re)` phase and must NOT be classified binary.
  const hasBinarySignPhase = isFreeScalarField || isWigner || isAds
  defines.push(`const IS_ADS: bool = ${isAds};`)
  defines.push(`const HAS_BINARY_SIGN_PHASE: bool = ${hasBinarySignPhase};`)
  // Pre-computed gradient normals: enabled for density-grid analytic modes (HO/hydrogen)
  // and any compute mode that explicitly provides a normal grid (e.g. FSF).
  defines.push(`const USE_PRECOMPUTED_NORMALS: bool = ${usePrecomputedNormals};`)

  // Profiling strip flags — default false, dead-code-eliminated when not profiling
  defines.push(
    `const PROFILING_STRIP_GRADIENT: bool = ${sanitizeShaderBoolean(strip?.gradient, false)};`
  )
  defines.push(
    `const PROFILING_STRIP_LIGHTING: bool = ${sanitizeShaderBoolean(strip?.lighting, false)};`
  )
  defines.push(
    `const PROFILING_STRIP_EMPTY_SKIP: bool = ${sanitizeShaderBoolean(strip?.emptySkip, false)};`
  )
  defines.push(
    `const PROFILING_STRIP_ADAPTIVE_STEP: bool = ${sanitizeShaderBoolean(strip?.adaptiveStep, false)};`
  )
  defines.push(
    `const PROFILING_STRIP_COMPOSITING: bool = ${sanitizeShaderBoolean(strip?.compositing, false)};`
  )
  if (sanitizeShaderBoolean(strip?.halfSamples, false)) {
    defines.push('const PROFILING_HALF_SAMPLES: bool = true;')
  } else {
    defines.push('const PROFILING_HALF_SAMPLES: bool = false;')
  }

  defines.push(`const SAMPLE_SPACE_ROTATION: bool = ${sampleSpaceRotation};`)

  if (useDensityGrid) features.push('Density Grid Raymarching')
  if (isWigner && useWignerCache) features.push('Wigner Cache')
  if (sampleSpaceRotation) features.push('Sample-Space Rotation')
  if (fastGridEmission) features.push('Fast Grid Emission')
  if (featureQuantumBackreaction) features.push('Quantum Backreaction Lens')
  if (featureBilocalBridge) features.push('Bilocal ER Bridge')
  if (featureEntropicShear) features.push('Entropic Time Shear')
  if (featureSpectralFlow) features.push('Spectral Dimension Flow')
  if (featureVacuumBubble) features.push('Vacuum Bubble Lens')
  if (featureNegativeAlphaPotentialOverlay) features.push('Negative-Alpha Potential Overlay')
  if (featureWdwOverlay) features.push('WdW Overlay')
  if (featureTdseBranchColor) features.push('TDSE Branch Color')
  if (featureAdsAmplitude) features.push('AdS Amplitude')
  if (featureGridPhaseOffset) features.push('Grid Phase Offset')

  return { defines, features }
}

const NODAL_SPECIALIZATION_OVERRIDE_PATTERN =
  /(^|\n)[ \t]*override\s+(NODAL_SPECIALIZATION_ENABLED|NODAL_SPECIALIZED_DEFINITION|NODAL_SPECIALIZED_RENDER_MODE|NODAL_SPECIALIZED_FAMILY_FILTER)\s*:[^;\n]+;[ \t]*(?=\n|$)/g

/** Remove fallback nodal override declarations when compose-level defines provide values. */
export function removeDefaultNodalSpecializationOverrides(wgsl: string): string {
  return wgsl.replace(NODAL_SPECIALIZATION_OVERRIDE_PATTERN, '$1')
}

/**
 * Select the main entry-point shader block based on rendering mode.
 * @param isWigner - Wigner phase-space mode
 * @param is2D - 2D rendering mode
 * @param isosurface - Isosurface mode
 * @param enableTemporal - Temporal accumulation enabled
 * @param useDensityGrid - Density grid sampling enabled
 * @param useDensityMatrix - Density matrix mode (open quantum)
 * @param useWignerCache - Pre-computed Wigner cache
 * @param gridOnly - Grid-only mode (no inline raymarch)
 */
export function selectMainBlock(
  isWigner: boolean,
  is2D: boolean,
  isosurface: boolean,
  enableTemporal: boolean,
  useDensityGrid: boolean,
  useDensityMatrix: boolean,
  useWignerCache: boolean,
  gridOnly: boolean
): string {
  if (isWigner) return generateMainBlockWigner2D(useWignerCache)
  if (is2D) return isosurface ? generateMainBlock2DIsolines() : generateMainBlock2D()
  if (isosurface) {
    return enableTemporal
      ? generateMainBlockIsosurfaceTemporal({ bayerJitter: true, useDensityGrid })
      : generateMainBlockIsosurface({ useDensityGrid })
  }
  return enableTemporal
    ? generateMainBlockTemporal({ bayerJitter: true, useDensityGrid, useDensityMatrix, gridOnly })
    : generateMainBlockVolumetric({ useDensityGrid, useDensityMatrix, gridOnly })
}

/**
 * Determine if grid-only mode can be used (excludes inline raymarch + entire
 * quantum math / density evaluation chain from the fragment shader).
 * @param config - Shader configuration
 * @param is2D - 2D mode flag
 */
export function canUseGridOnly(config: SchroedingerWGSLShaderConfig, is2D: boolean): boolean {
  const isosurface = sanitizeShaderBoolean(config.isosurface, false)
  const useDensityGrid = sanitizeShaderBoolean(config.useDensityGrid, false)
  const colorAlgorithm = sanitizeShaderColorAlgorithm(config.colorAlgorithm)
  const phaseMateriality = sanitizeShaderBoolean(config.phaseMateriality, true)
  const interference = sanitizeShaderBoolean(config.interference, true)
  const nodal = sanitizeShaderBoolean(config.nodal, true)
  const probabilityCurrentEnabled = sanitizeShaderBoolean(config.probabilityCurrentEnabled, true)
  const radialProbabilityEnabled = sanitizeShaderBoolean(config.radialProbabilityEnabled, false)
  const bornNullWeaveEnabled = sanitizeShaderBoolean(config.bornNullWeaveEnabled, false)
  const phaseShimmerEnabled = sanitizeShaderBoolean(config.phaseShimmerEnabled, false)
  const phaseAnimationEnabled = sanitizeShaderBoolean(config.phaseAnimationEnabled, false)
  const useDensityMatrix = sanitizeShaderBoolean(config.useDensityMatrix, false)
  const crossSectionEnabled = sanitizeShaderBoolean(config.crossSectionEnabled, true)

  const isPhaseColorAlg = PHASE_COLOR_ALGS.includes(
    colorAlgorithm as (typeof PHASE_COLOR_ALGS)[number]
  )

  return (
    useDensityGrid &&
    !is2D &&
    !isosurface &&
    !isPhaseColorAlg &&
    !phaseMateriality &&
    !interference &&
    !probabilityCurrentEnabled &&
    !radialProbabilityEnabled &&
    !bornNullWeaveEnabled &&
    !phaseShimmerEnabled &&
    !phaseAnimationEnabled &&
    !nodal &&
    !useDensityMatrix &&
    !crossSectionEnabled
  )
}
