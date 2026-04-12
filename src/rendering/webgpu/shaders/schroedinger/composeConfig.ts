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

import type { WGSLShaderConfig } from '../shared/compose-helpers'
import {
  generateMainBlockIsosurface,
  generateMainBlockIsosurfaceTemporal,
  generateMainBlockTemporal,
  generateMainBlockVolumetric,
  PHASE_COLOR_ALGS,
} from './main.wgsl'
import { generateMainBlock2D, generateMainBlock2DIsolines } from './main2D.wgsl'
import { generateMainBlockWigner2D } from './mainWigner2D.wgsl'

/** Quantum physics mode for Schrödinger visualization */
export type QuantumModeForShader = 'harmonicOscillator' | 'hydrogenND' | 'hydrogenNDCoupled'

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
  /** Wigner phase-space mode — forces 2D pipeline with phase-space evaluation. */
  isWigner?: boolean
  /** Use pre-computed Wigner cache texture instead of inline evaluation. */
  useWignerCache?: boolean
  /** Free scalar field mode — cubic lattice, no Gaussian envelope. */
  isFreeScalar?: boolean
  /** Compute mode has a pre-computed normal grid texture at binding 7. */
  hasPrecomputedNormals?: boolean
  /** Quantum walk mode — discrete lattice, density brightness uses linear rho. */
  isQuantumWalk?: boolean
  /** Pauli spinor mode — alpha encodes density, not potential. */
  isPauli?: boolean
  /** Include analysis texture bindings for free-scalar educational color modes. */
  freeScalarAnalysis?: boolean
  /** Density matrix mode (open quantum) — disables inline wavefunction fallback. */
  useDensityMatrix?: boolean
  /** Compile-time gate for cross-section slice (default: true). */
  crossSectionEnabled?: boolean
  /** Compile-time gate for probability current j-field (default: true). */
  probabilityCurrentEnabled?: boolean
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
  useCache: boolean
  useAnalyticalGradient: boolean
  useRobustEigenInterpolation: boolean
  isDualChannel: boolean
  needsCosine: boolean
  needsOklab: boolean
  usePrecomputedNormals: boolean
}

/**
 * Derive boolean shader flags from the shader config.
 * @param config - Shader configuration
 */
export function derivedShaderFlags(config: SchroedingerWGSLShaderConfig): DerivedShaderFlags {
  const {
    dimension,
    quantumMode = 'harmonicOscillator',
    colorAlgorithm = 4,
    useEigenfunctionCache = false,
    useAnalyticalGradient: useAnalyticalGradientFlag = true,
    useRobustEigenInterpolation: useRobustEigenInterpolationFlag = true,
    isWigner = false,
    isFreeScalar = false,
    useDensityGrid = false,
    termCount,
  } = config
  const is2D = dimension === 2 || isWigner
  const isHydrogenFamily = quantumMode === 'hydrogenND' || quantumMode === 'hydrogenNDCoupled'
  const isHydrogenCoupled = quantumMode === 'hydrogenNDCoupled'
  const actualDim = isWigner
    ? Math.min(Math.max(dimension, 3), 11)
    : Math.min(Math.max(dimension, 2), 11)
  const includeHydrogen = isHydrogenFamily
  const includeHydrogenND = isHydrogenFamily
  const includeHarmonic = !isHydrogenFamily
  const hydrogenNDDimension = includeHydrogenND ? actualDim : 0
  const useUnrolledHO = includeHarmonic && termCount !== undefined
  const useCache = useEigenfunctionCache && !is2D
  const useAnalyticalGradient = useCache && includeHarmonic && useAnalyticalGradientFlag
  const useRobustEigenInterpolation = useCache && useRobustEigenInterpolationFlag
  const isDualChannel = [23, 24, 25].includes(colorAlgorithm)
  const needsCosine = [1, 2].includes(colorAlgorithm)
  const needsOklab = [0, 6].includes(colorAlgorithm)
  // Pre-computed normal grid: available for analytical modes (always) and any
  // compute mode that explicitly sets hasPrecomputedNormals (FSF has it).
  const usePrecomputedNormals =
    useDensityGrid && (!isFreeScalar || config.hasPrecomputedNormals === true)
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
    useCache,
    useAnalyticalGradient,
    useRobustEigenInterpolation,
    isDualChannel,
    needsCosine,
    needsOklab,
    usePrecomputedNormals,
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
  termCount: number | undefined
  useCache: boolean
  useAnalyticalGradient: boolean
  useRobustEigenInterpolation: boolean
  quantumMode: string
  isosurface: boolean
  nodal: boolean
  phaseMateriality: boolean
  interference: boolean
  uncertaintyBoundary: boolean
  colorAlgorithm: number
  isDualChannel: boolean
  useDensityGrid: boolean
  densityGridHasPhase: boolean
  densityGridSize: number
  isFreeScalar: boolean
  usePrecomputedNormals: boolean
  isQuantumWalk: boolean
  isPauli: boolean
  useWignerCache: boolean
  crossSectionEnabled: boolean
  probabilityCurrentEnabled: boolean
  profilingStrip?: SchroedingerWGSLShaderConfig['profilingStrip']
}): { defines: string[]; features: string[] } {
  const defines: string[] = []
  const features: string[] = []

  // Only ACTUAL_DIM (clamped) is emitted — the previously-emitted
  // un-clamped `const DIMENSION` was never read by any WGSL shader.
  // Dropped to avoid misleading readers about which dimension the
  // shaders actually use. See compose.ts / composeWignerCache.ts for
  // the same note in the sibling composers.
  defines.push(`const ACTUAL_DIM: i32 = ${flags.actualDim};`)
  defines.push(`const IS_2D: bool = ${flags.is2D};`)
  defines.push(`const IS_WIGNER: bool = ${flags.isWigner};`)
  features.push(`${flags.dimension}D Quantum`)

  if (flags.enableTemporal) {
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

  if (flags.useCache) {
    defines.push('const USE_EIGENFUNCTION_CACHE: bool = true;')
    features.push('Eigenfunction Cache')
  } else {
    defines.push('const USE_EIGENFUNCTION_CACHE: bool = false;')
  }
  defines.push(`const USE_ANALYTICAL_GRADIENT: bool = ${flags.useAnalyticalGradient};`)
  defines.push(`const USE_ROBUST_EIGEN_INTERPOLATION: bool = ${flags.useRobustEigenInterpolation};`)
  defines.push(`const FEATURE_RADIAL_PROBABILITY: bool = ${flags.includeHydrogen};`)
  defines.push(`const FEATURE_CROSS_SECTION: bool = ${flags.crossSectionEnabled};`)
  defines.push(`const FEATURE_PROBABILITY_CURRENT: bool = ${flags.probabilityCurrentEnabled};`)

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

  if (flags.isWigner) {
    features.push('Wigner Phase-Space Mode')
  } else if (flags.is2D) {
    features.push(flags.isosurface ? '2D Isolines Mode' : '2D Heatmap Mode')
  } else if (flags.isosurface) {
    features.push('Isosurface Mode')
  } else {
    features.push('Volumetric Mode')
  }

  if (!flags.is2D) features.push('Beer-Lambert')

  defines.push(`const FEATURE_NODAL: bool = ${flags.nodal};`)
  defines.push(`const FEATURE_PHASE_MATERIALITY: bool = ${flags.phaseMateriality};`)
  defines.push(`const FEATURE_INTERFERENCE: bool = ${flags.interference};`)
  defines.push(`const FEATURE_UNCERTAINTY_BOUNDARY: bool = ${flags.uncertaintyBoundary};`)
  defines.push(`const COLOR_ALGORITHM: i32 = ${flags.colorAlgorithm};`)
  defines.push(`const IS_DUAL_CHANNEL: bool = ${flags.isDualChannel};`)
  defines.push(`const USE_DENSITY_GRID: bool = ${flags.useDensityGrid};`)
  defines.push(`const DENSITY_GRID_HAS_PHASE: bool = ${flags.densityGridHasPhase};`)
  defines.push(`const DENSITY_GRID_SIZE: f32 = ${flags.densityGridSize}.0;`)
  defines.push(`const IS_FREE_SCALAR: bool = ${flags.isFreeScalar};`)
  defines.push(`const IS_QUANTUM_WALK: bool = ${flags.isQuantumWalk};`)
  defines.push(`const IS_PAULI: bool = ${flags.isPauli};`)
  // Pre-computed gradient normals: enabled for density-grid analytic modes (HO/hydrogen)
  // and any compute mode that explicitly provides a normal grid (e.g. FSF).
  defines.push(`const USE_PRECOMPUTED_NORMALS: bool = ${flags.usePrecomputedNormals};`)

  // Profiling strip flags — default false, dead-code-eliminated when not profiling
  const strip = flags.profilingStrip
  defines.push(`const PROFILING_STRIP_GRADIENT: bool = ${strip?.gradient ?? false};`)
  defines.push(`const PROFILING_STRIP_LIGHTING: bool = ${strip?.lighting ?? false};`)
  defines.push(`const PROFILING_STRIP_EMPTY_SKIP: bool = ${strip?.emptySkip ?? false};`)
  defines.push(`const PROFILING_STRIP_ADAPTIVE_STEP: bool = ${strip?.adaptiveStep ?? false};`)
  defines.push(`const PROFILING_STRIP_COMPOSITING: bool = ${strip?.compositing ?? false};`)
  if (strip?.halfSamples) {
    defines.push('const PROFILING_HALF_SAMPLES: bool = true;')
  } else {
    defines.push('const PROFILING_HALF_SAMPLES: bool = false;')
  }

  if (flags.useDensityGrid) features.push('Density Grid Raymarching')
  if (flags.isWigner && flags.useWignerCache) features.push('Wigner Cache')

  return { defines, features }
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
    : generateMainBlockVolumetric({ useDensityGrid, gridOnly })
}

/**
 * Determine if grid-only mode can be used (excludes inline raymarch + entire
 * quantum math / density evaluation chain from the fragment shader).
 * @param config - Shader configuration
 * @param is2D - 2D mode flag
 */
export function canUseGridOnly(config: SchroedingerWGSLShaderConfig, is2D: boolean): boolean {
  const {
    isosurface = false,
    useDensityGrid = false,
    colorAlgorithm = 4,
    phaseMateriality = true,
    interference = true,
    nodal = true,
    probabilityCurrentEnabled = true,
    useDensityMatrix = false,
    crossSectionEnabled = true,
  } = config

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
    !nodal &&
    !useDensityMatrix &&
    !crossSectionEnabled
  )
}
