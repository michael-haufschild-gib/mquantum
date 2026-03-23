/**
 * Schrödinger WGSL Shader Composer
 *
 * Assembles complete Schrödinger fragment shader from modular blocks.
 *
 * Block assembly order:
 * 1. Core: constants, uniforms, bind groups
 * 2. Quantum math: complex, hermite, ho1d, psi, density
 * 3. Volume rendering: absorption, emission, integration
 * 4. Color and effects
 * 5. Main shader
 *
 * @module rendering/webgpu/shaders/schroedinger/compose
 */

import { cosinePaletteBlock } from '../shared/color/cosine-palette.wgsl'
import { hslBlock } from '../shared/color/hsl.wgsl'
import { oklabBlock } from '../shared/color/oklab.wgsl'
import {
  assembleShaderBlocks,
  generateConsolidatedBindGroups,
  singleOutputBlock,
  type WGSLShaderConfig,
} from '../shared/compose-helpers'
import { constantsBlock } from '../shared/core/constants.wgsl'
import { uniformsBlock } from '../shared/core/uniforms.wgsl'
import { temporalBlock } from '../shared/features/temporal.wgsl'
import { ggxBlock } from '../shared/lighting/ggx.wgsl'
import { multiLightBlock } from '../shared/lighting/multi-light.wgsl'
import { sphereIntersectBlock } from '../shared/raymarch/sphere-intersect.wgsl'
import type { ColorAlgorithm } from '../types'
import {
  buildBindGroupBlock,
  buildQuantumMathBlocks,
  buildVolumeBlocks,
  type ShaderBlockEntry,
} from './composeBlockBuilders'
import {
  generateMainBlockIsosurface,
  generateMainBlockIsosurfaceTemporal,
  generateMainBlockTemporal,
  generateMainBlockVolumetric,
  temporalMRTOutputBlock,
} from './main.wgsl'
import { generateMainBlock2D, generateMainBlock2DIsolines } from './main2D.wgsl'
import { generateMainBlockWigner2D } from './mainWigner2D.wgsl'
import { COLOR_ALG_NAMES } from './volume/emission.wgsl'

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
  colorAlgorithm?: ColorAlgorithm
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
  /** Quantum walk mode — discrete lattice, density brightness uses linear rho. */
  isQuantumWalk?: boolean
  /** Pauli spinor mode — alpha encodes density, not potential. */
  isPauli?: boolean
  /** Include analysis texture bindings for free-scalar educational color modes. */
  freeScalarAnalysis?: boolean
  /** Density matrix mode (open quantum) — disables inline wavefunction fallback. */
  useDensityMatrix?: boolean
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

/** Select the main entry-point shader block based on rendering mode. */
function selectMainBlock(
  isWigner: boolean,
  is2D: boolean,
  isosurface: boolean,
  enableTemporal: boolean,
  useDensityGrid: boolean,
  useDensityMatrix: boolean,
  useWignerCache: boolean
): string {
  if (isWigner) return generateMainBlockWigner2D(useWignerCache)
  if (is2D) return isosurface ? generateMainBlock2DIsolines() : generateMainBlock2D()
  if (isosurface) {
    return enableTemporal
      ? generateMainBlockIsosurfaceTemporal({ bayerJitter: true, useDensityGrid })
      : generateMainBlockIsosurface({ useDensityGrid })
  }
  return enableTemporal
    ? generateMainBlockTemporal({ bayerJitter: true, useDensityGrid, useDensityMatrix })
    : generateMainBlockVolumetric({ useDensityGrid })
}

/** Build WGSL compile-time defines and human-readable feature tags. */
function buildShaderDefinesAndFeatures(flags: {
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
  isQuantumWalk: boolean
  isPauli: boolean
  useWignerCache: boolean
  profilingStrip?: SchroedingerWGSLShaderConfig['profilingStrip']
}): { defines: string[]; features: string[] } {
  const defines: string[] = []
  const features: string[] = []

  defines.push(`const DIMENSION: i32 = ${flags.dimension};`)
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
  // Pre-computed gradient normals: enabled for density-grid analytic modes (HO/hydrogen).
  // Compute modes (TDSE/BEC/Dirac/FSF) don't yet have the gradient pass, so they fall
  // back to inline 6-fetch central differences.
  defines.push(
    `const USE_PRECOMPUTED_NORMALS: bool = ${flags.useDensityGrid && !flags.isFreeScalar};`
  )

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

/** Derive boolean shader flags from the shader config. Extracted to reduce compose function complexity. */
function derivedShaderFlags(config: SchroedingerWGSLShaderConfig) {
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
  const actualDim =
    isHydrogenFamily || isWigner
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
  const usePrecomputedNormals = useDensityGrid && !isFreeScalar
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

/**
 * Compose a complete Schrödinger fragment shader from modular WGSL blocks.
 *
 * Selects quantum mode blocks (HO/hydrogen), rendering pipeline (2D/volumetric/isosurface),
 * and optional features (eigenfunction cache, density grid, Wigner) based on the config.
 *
 * @param config - Shader composition configuration
 * @returns Assembled WGSL source, module names, and human-readable feature tags
 */
export function composeSchroedingerShader(config: SchroedingerWGSLShaderConfig): {
  wgsl: string
  modules: string[]
  features: string[]
} {
  const {
    dimension,
    isosurface = false,
    temporalAccumulation: enableTemporal = false,
    useDensityGrid = false,
    densityGridHasPhase = false,
    densityGridSize = 64,
    quantumMode = 'harmonicOscillator',
    termCount,
    nodal = true,
    phaseMateriality = true,
    interference = true,
    uncertaintyBoundary = true,
    colorAlgorithm = 4,
    isWigner = false,
    useWignerCache = false,
    isFreeScalar = false,
    isQuantumWalk = false,
    isPauli = false,
    freeScalarAnalysis = false,
    useDensityMatrix = false,
    overrides = [],
  } = config

  // Derived shader flags (extracted to reduce function complexity)
  const derived = derivedShaderFlags(config)
  const {
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
  } = derived

  // Build compile-time defines and feature tags
  const { defines, features } = buildShaderDefinesAndFeatures({
    dimension,
    actualDim,
    is2D,
    isWigner,
    enableTemporal,
    includeHydrogen,
    includeHydrogenND,
    hydrogenNDDimension,
    useUnrolledHO,
    termCount,
    useCache,
    useAnalyticalGradient,
    useRobustEigenInterpolation,
    quantumMode,
    isosurface,
    nodal,
    phaseMateriality,
    interference,
    uncertaintyBoundary,
    colorAlgorithm,
    isDualChannel,
    useDensityGrid,
    densityGridHasPhase,
    densityGridSize,
    isFreeScalar,
    isQuantumWalk,
    isPauli,
    useWignerCache,
    profilingStrip: config.profilingStrip,
  })
  features.push(`Color: ${COLOR_ALG_NAMES[colorAlgorithm] ?? colorAlgorithm}`)

  const selectedMainBlock = selectMainBlock(
    isWigner,
    is2D,
    isosurface,
    enableTemporal,
    useDensityGrid,
    useDensityMatrix,
    useWignerCache
  )

  // Build blocks array in dependency order
  const blocks: ShaderBlockEntry[] = [
    {
      name: 'Vertex Inputs',
      content: is2D
        ? /* wgsl */ `
struct VertexOutput {
  @builtin(position) clipPosition: vec4f,
  @location(0) uv: vec2f,
}
`
        : /* wgsl */ `
struct VertexOutput {
  @builtin(position) clipPosition: vec4f,
  @location(0) vPosition: vec3f,
}
`,
    },
    { name: 'Defines', content: defines.join('\n') },
    { name: 'Constants', content: constantsBlock },
    { name: 'Shared Uniforms', content: uniformsBlock },
    { name: 'Standard Bind Groups', content: generateConsolidatedBindGroups() },
    {
      name: 'Schrödinger Uniforms',
      content: buildBindGroupBlock({
        useCache,
        isWigner,
        useWignerCache,
        useDensityGrid,
        usePrecomputedNormals,
        freeScalarAnalysis,
      }),
    },

    // Quantum math modules
    ...buildQuantumMathBlocks({
      actualDim,
      includeHarmonic,
      includeHydrogen,
      includeHydrogenND,
      hydrogenNDDimension,
      isHydrogenFamily,
      isHydrogenCoupled,
      useCache,
      useUnrolledHO,
      termCount,
      isWigner,
    }),

    // Color system
    { name: 'Color (HSL)', content: hslBlock },
    { name: 'Color (Cosine)', content: cosinePaletteBlock, condition: needsCosine },
    { name: 'Color (Oklab)', content: oklabBlock, condition: needsOklab },

    // Lighting (GGX PBR for isosurface only)
    { name: 'GGX PBR', content: ggxBlock, condition: isosurface && !is2D },
    { name: 'Multi-Light System', content: multiLightBlock, condition: isosurface && !is2D },

    // Volume rendering
    ...buildVolumeBlocks({
      is2D,
      colorAlgorithm,
      includeHydrogen,
      useCache,
      actualDim,
      termCount,
      useDensityGrid,
      usePrecomputedNormals,
      freeScalarAnalysis,
      nodal,
    }),

    // Geometry
    { name: 'Sphere Intersection', content: sphereIntersectBlock, condition: !is2D },

    // Features + output
    { name: 'Temporal Accumulation', content: temporalBlock, condition: enableTemporal && !is2D },
    {
      name: 'Fragment Output (Isosurface)',
      content: singleOutputBlock,
      condition: isosurface && !enableTemporal && !is2D,
    },
    {
      name: 'Fragment Output (Temporal)',
      content: temporalMRTOutputBlock,
      condition: enableTemporal && !is2D,
    },

    // Main shader
    { name: 'Main', content: selectedMainBlock },
  ]

  // Assemble
  const { wgsl, modules } = assembleShaderBlocks(
    blocks,
    overrides.map((o) => ({ target: o.target, replacement: o.replacement }))
  )

  return { wgsl, modules, features }
}

// Re-export vertex shaders from dedicated module
export { composeSchroedingerVertexShader, composeSchroedingerVertexShader2D } from './vertex.wgsl'
