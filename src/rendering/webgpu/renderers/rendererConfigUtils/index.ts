/**
 * Configuration utilities for the Schrodinger renderer.
 *
 * Pure functions that derive shader configs, pipeline outputs, and cache keys
 * from the renderer configuration. No GPU resources or class state.
 *
 * @module rendering/webgpu/renderers/rendererConfigUtils
 */

import { isWdwZetaMode } from '@/lib/geometry/extended/wdwZeta/shared'
import {
  getQuantumTypeEntry,
  getQuantumTypeRuntime,
  isComputeQuantumType,
  isHydrogenFamilyQuantumType,
  supportsSchroedingerSurfaceMode,
} from '@/lib/geometry/registry'

import type {
  QuantumModeForShader,
  SchroedingerWGSLShaderConfig,
} from '../../shaders/schroedinger/compose'
import type { SchrodingerRendererConfig } from '../schrodingerRendererTypes'
import { isFreeScalarAnalysisAlgorithm } from '../schrodingerRendererTypes'

// ---------------------------------------------------------------------------
// Mode classification helpers
// ---------------------------------------------------------------------------

/** Whether the quantum mode uses a compute-pass density grid instead of analytic evaluation. */
export function isComputeQuantumMode(config: SchrodingerRendererConfig): boolean {
  return (
    (config.quantumMode != null && isComputeQuantumType(config.quantumMode)) ||
    config.isPauli === true ||
    config.isBellPair === true
  )
}

/** Whether the pipeline uses a 2D fullscreen-triangle path (no vertex/index buffers). */
export function isPipeline2D(config: SchrodingerRendererConfig): boolean {
  // Coherence Horizon always renders through its 3D geodesic main block,
  // even if a stale 'wigner' representation lingers in the config.
  if (config.quantumMode === 'coherenceHorizon') return false
  // Arithmetic Horizon (riemannZeta) likewise always renders through its
  // dedicated 3D volumetric main block — never the 2D / Wigner pipeline.
  if (config.quantumMode === 'riemannZeta') return false
  // Hilbert–Pólya likewise always renders through its dedicated 3D
  // volumetric main block — never the 2D / Wigner pipeline.
  if (config.quantumMode === 'hilbertPolya') return false
  // Bifurcation Horizon likewise always renders through its dedicated 3D
  // volumetric main block — never the 2D / Wigner pipeline.
  if (config.quantumMode === 'bifurcationHorizon') return false
  // Modular Knot likewise always renders through its dedicated 3D-texture
  // volumetric main block — never the 2D / Wigner pipeline.
  if (config.quantumMode === 'modularKnot') return false
  // The WDW ⊗ ζ suite always renders through its shared 3D-texture volumetric
  // main block — never the 2D / Wigner pipeline.
  if (isWdwZetaMode(config.quantumMode)) return false
  return (
    !isComputeQuantumMode(config) &&
    ((config.dimension ?? 3) === 2 || config.representation === 'wigner')
  )
}

// ---------------------------------------------------------------------------
// Open quantum grid sizing
// ---------------------------------------------------------------------------

/**
 * Reduce density grid resolution when the open-quantum basis is large
 * to keep per-frame GPU cost bounded.
 *
 * @param baseSize - Default grid resolution (e.g. 96)
 * @param basisK - Number of basis states in the density matrix
 * @returns Effective grid resolution
 */
export function computeOpenQuantumGridSize(baseSize: number, basisK: number): number {
  if (basisK <= 6) return baseSize
  if (basisK <= 10) return Math.min(baseSize, 48)
  return Math.min(baseSize, 32)
}

// ---------------------------------------------------------------------------
// Mode overrides
// ---------------------------------------------------------------------------

/**
 * Apply mode-specific overrides to the renderer config.
 * - 2D / Wigner: disable temporal, eigencache, analytical gradient
 * - Compute modes: disable temporal, force dimension >= 3
 *
 * Returns a new config object (does not mutate the input).
 */
export function applyModeOverrides(config?: SchrodingerRendererConfig): SchrodingerRendererConfig {
  const result: SchrodingerRendererConfig = {
    dimension: 3,
    isosurface: false,
    quantumMode: 'harmonicOscillator',
    temporal: false,
    nodalEnabled: true,
    phaseMaterialityEnabled: true,
    interferenceEnabled: true,
    uncertaintyBoundaryEnabled: true,
    analyticalGradientEnabled: true,
    fastEigenInterpolationEnabled: true,
    ...config,
  }

  if (isPipeline2D(result)) {
    result.temporal = false
    result.eigenfunctionCacheEnabled = false
    result.analyticalGradientEnabled = false
    result.fastEigenInterpolationEnabled = false
  }

  if (result.quantumMode === 'coherenceHorizon') {
    // The geodesic main block renders full-res single-output and evaluates its
    // cat state inline — temporal MRT and the eigenfunction cache never apply.
    result.temporal = false
    result.eigenfunctionCacheEnabled = false
    result.analyticalGradientEnabled = false
    result.fastEigenInterpolationEnabled = false
  }

  if (result.quantumMode === 'riemannZeta') {
    // The volumetric main block renders full-res single-output and samples the
    // radial LUT inline — temporal MRT and the eigenfunction cache never apply.
    result.temporal = false
    result.eigenfunctionCacheEnabled = false
    result.analyticalGradientEnabled = false
    result.fastEigenInterpolationEnabled = false
  }

  if (result.quantumMode === 'hilbertPolya') {
    // The volumetric main block renders full-res single-output and samples the
    // volume LUT inline — temporal MRT and the eigenfunction cache never apply.
    result.temporal = false
    result.eigenfunctionCacheEnabled = false
    result.analyticalGradientEnabled = false
    result.fastEigenInterpolationEnabled = false
  }

  if (result.quantumMode === 'bifurcationHorizon') {
    // The volumetric main block renders full-res single-output and samples the
    // 2D (t, u) LUT inline — temporal MRT and the eigenfunction cache never apply.
    result.temporal = false
    result.eigenfunctionCacheEnabled = false
    result.analyticalGradientEnabled = false
    result.fastEigenInterpolationEnabled = false
  }

  if (result.quantumMode === 'modularKnot') {
    // The 3D-texture volumetric main block renders full-res single-output and
    // samples the baked RGBA volume inline — temporal MRT and the eigenfunction
    // cache never apply.
    result.temporal = false
    result.eigenfunctionCacheEnabled = false
    result.analyticalGradientEnabled = false
    result.fastEigenInterpolationEnabled = false
  }

  if (isWdwZetaMode(result.quantumMode)) {
    // The WDW ⊗ ζ suite shares one 3D-texture volumetric main block: full-res
    // single-output sampling the baked RGBA volume inline — temporal MRT, the
    // eigenfunction cache, and analytical gradients never apply.
    result.temporal = false
    result.eigenfunctionCacheEnabled = false
    result.analyticalGradientEnabled = false
    result.fastEigenInterpolationEnabled = false
  }

  if (isComputeQuantumMode(result)) {
    result.temporal = false
    // Clamp to the mode's minimum dimension from the quantum type registry.
    // All compute modes currently require 3D+ (no 2D grid rendering path).
    const modeKey = result.isPauli
      ? 'pauliSpinor'
      : result.isBellPair
        ? 'bellTest'
        : result.quantumMode
    const dimensions = modeKey ? getQuantumTypeEntry(modeKey)?.dimensions : undefined
    const minDim = dimensions?.min ?? 3
    const maxDim = dimensions?.max ?? result.dimension ?? minDim
    result.dimension = Math.max(minDim, Math.min(maxDim, result.dimension ?? 3))
  }

  const surfaceObjectType: 'schroedinger' | 'pauliSpinor' | 'bellPair' = result.isPauli
    ? 'pauliSpinor'
    : result.isBellPair
      ? 'bellPair'
      : 'schroedinger'
  if (
    !supportsSchroedingerSurfaceMode({
      objectType: surfaceObjectType,
      quantumMode: result.quantumMode,
      dimension: result.dimension ?? 3,
      representation: result.representation,
    })
  ) {
    result.isosurface = false
  }

  return result
}

// ---------------------------------------------------------------------------
// Shader config builder
// ---------------------------------------------------------------------------

/** Compute density grid resolution and mode from renderer parameters. */
function computeDensityGridConfig(
  computeMode: boolean,
  isosurface: boolean,
  pipelineIs2D: boolean,
  openQuantumEnabled: boolean,
  isHydrogen: boolean,
  termCount: number | undefined,
  configuredResolution?: number
): { useDensityGrid: boolean; densityGridSize: number } {
  const useDensityGrid = computeMode || (!pipelineIs2D && (openQuantumEnabled || !isosurface))
  const baseDensityGridSize = configuredResolution ?? 96
  const estimatedK = openQuantumEnabled ? (isHydrogen ? 10 : (termCount ?? 4)) : 0
  const densityGridSize = openQuantumEnabled
    ? computeOpenQuantumGridSize(baseDensityGridSize, estimatedK)
    : baseDensityGridSize
  return { useDensityGrid, densityGridSize }
}

/**
 * Shared shader config for the horizon-family modes (Coherence Horizon,
 * Arithmetic Horizon, Hilbert–Pólya). Each composes a dedicated,
 * self-contained main block: no density grid, no eigencache, no temporal
 * MRT, and none of the shared-path overlay features. Every excluded flag
 * keeps the bind group layout in lockstep with the owning strategy's
 * `setup()`, which declares at most a single binding-2 LUT entry.
 */
function buildDedicatedMainBlockConfig(
  rendererConfig: SchrodingerRendererConfig,
  densityGridSize: number,
  flags: Pick<
    SchroedingerWGSLShaderConfig,
    | 'isCoherenceHorizon'
    | 'isRiemannZeta'
    | 'isHilbertPolya'
    | 'isBifurcationHorizon'
    | 'isModularKnot'
    | 'isWdwZetaVolume'
  >
): SchroedingerWGSLShaderConfig {
  return {
    dimension: rendererConfig.dimension!,
    isosurface: false,
    quantumMode: 'harmonicOscillator',
    termCount: 1,
    nodal: false,
    nodalSpecializationEnabled: false,
    nodalDefinition: 'psiAbs',
    nodalRenderMode: 'band',
    nodalFamilyFilter: 'all',
    colorAlgorithm: rendererConfig.colorAlgorithm,
    temporalAccumulation: false,
    phaseMateriality: false,
    interference: false,
    uncertaintyBoundary: false,
    useEigenfunctionCache: false,
    useAnalyticalGradient: false,
    useRobustEigenInterpolation: false,
    useDensityGrid: false,
    densityGridSize,
    densityGridHasPhase: undefined,
    isWigner: false,
    useWignerCache: false,
    isFreeScalar: false,
    isFreeScalarField: false,
    hasPrecomputedNormals: false,
    isQuantumWalk: false,
    isPauli: false,
    isAds: false,
    isCoherenceHorizon: false,
    isRiemannZeta: false,
    isHilbertPolya: false,
    isBifurcationHorizon: false,
    isModularKnot: false,
    isWdwZetaVolume: false,
    freeScalarAnalysis: false,
    useDensityMatrix: false,
    crossSectionEnabled: false,
    probabilityCurrentEnabled: false,
    radialProbabilityEnabled: false,
    bornNullWeaveEnabled: false,
    phaseShimmerEnabled: false,
    phaseAnimationEnabled: false,
    fastGridEmission: false,
    quantumBackreactionLensing: false,
    bilocalERBridge: false,
    entropicTimeShear: false,
    spectralDimensionFlow: false,
    vacuumBubbleLens: false,
    negativeAlphaPotentialOverlay: false,
    wdwOverlay: false,
    tdseBranchColor: false,
    adsAmplitude: false,
    gridPhaseOffset: false,
    sampleSpaceRotation: false,
    profilingStrip: undefined,
    ...flags,
  }
}

/**
 * Derive the compile-time shader configuration from the renderer config.
 * This determines which shader blocks are included (nodal, phase materiality, etc.)
 * and controls cache/grid sizing.
 */
export function buildShaderConfig(
  rendererConfig: SchrodingerRendererConfig
): SchroedingerWGSLShaderConfig {
  const dim = rendererConfig.dimension ?? 3
  const isPauli = rendererConfig.isPauli === true
  const isBellPair = rendererConfig.isBellPair === true
  const modeKey = isPauli ? 'pauliSpinor' : isBellPair ? 'bellTest' : rendererConfig.quantumMode
  const runtime = modeKey ? getQuantumTypeRuntime(modeKey) : undefined
  const strategyKind = runtime?.strategy
  const isFreeScalarField = strategyKind === 'freeScalarField'
  const isCoherenceHorizon = strategyKind === 'coherenceHorizon'
  const isRiemannZeta = strategyKind === 'riemannZeta'
  const isHilbertPolya = strategyKind === 'hilbertPolya'
  const isBifurcationHorizon = strategyKind === 'bifurcationHorizon'
  const isModularKnot = strategyKind === 'modularKnot'
  const isWdwZetaVolume = strategyKind === 'wdwZetaVolume'
  const computeMode = isComputeQuantumMode(rendererConfig)
  const isWigner = rendererConfig.representation === 'wigner'
  const pipelineIs2D = !computeMode && (dim === 2 || isWigner)

  const enableCache = rendererConfig.eigenfunctionCacheEnabled ?? !pipelineIs2D
  const isHydrogen = modeKey ? isHydrogenFamilyQuantumType(modeKey) : false
  const surfaceObjectTypeShader: 'schroedinger' | 'pauliSpinor' | 'bellPair' = isPauli
    ? 'pauliSpinor'
    : isBellPair
      ? 'bellPair'
      : 'schroedinger'
  const isosurface = supportsSchroedingerSurfaceMode({
    objectType: surfaceObjectTypeShader,
    quantumMode: rendererConfig.quantumMode,
    dimension: dim,
    representation: rendererConfig.representation,
  })
    ? (rendererConfig.isosurface ?? false)
    : false
  const openQuantumEnabled = rendererConfig.openQuantumEnabled ?? false

  const { useDensityGrid, densityGridSize } = computeDensityGridConfig(
    computeMode,
    isosurface,
    pipelineIs2D,
    openQuantumEnabled,
    isHydrogen,
    rendererConfig.termCount,
    rendererConfig.densityGridResolution
  )

  // Enable the eigenfunction cache alongside the density grid so the inline
  // raymarch fallback (triggered by phase-dependent color algorithms and by the
  // grid-transparent safety path) uses the fast cached ho1D/hydrogenND
  // evaluation instead of recomputing Hermite / Laguerre polynomials per step.
  // The cache and the grid bind to disjoint slots (2/3 vs 4/5) so they coexist.
  // Compute modes (TDSE/BEC/Dirac/QuantumWalk) never instantiate an
  // EigenfunctionCacheComputePass, so the cache must stay off for them.
  const useEigenfunctionCache = !pipelineIs2D && !computeMode && enableCache
  const useAnalyticalGradient = computeMode
    ? false
    : (rendererConfig.analyticalGradientEnabled ?? true)
  const useRobustEigenInterpolation = computeMode
    ? false
    : !(rendererConfig.fastEigenInterpolationEnabled ?? true)
  const nodal = computeMode ? false : (rendererConfig.nodalEnabled ?? true)

  const shaderQuantumMode: QuantumModeForShader = computeMode
    ? 'harmonicOscillator'
    : (rendererConfig.quantumMode as QuantumModeForShader)

  if (isCoherenceHorizon) {
    // Coherence Horizon: dedicated geodesic main block; the strategy declares
    // no additional layout entries.
    return buildDedicatedMainBlockConfig(rendererConfig, densityGridSize, {
      isCoherenceHorizon: true,
    })
  }

  if (isRiemannZeta) {
    // Arithmetic Horizon: dedicated volumetric main block sampling the
    // group-2 radial LUT (RiemannZetaStrategy adds only the binding-2 entry).
    return buildDedicatedMainBlockConfig(rendererConfig, densityGridSize, {
      isRiemannZeta: true,
    })
  }

  if (isHilbertPolya) {
    // Hilbert–Pólya: dedicated volumetric main block sampling the group-2
    // volume LUT (HilbertPolyaStrategy adds only the binding-2 entry).
    return buildDedicatedMainBlockConfig(rendererConfig, densityGridSize, {
      isHilbertPolya: true,
    })
  }

  if (isBifurcationHorizon) {
    // Bifurcation Horizon: dedicated volumetric main block sampling the group-2
    // 2D (t, u) LUT (BifurcationHorizonStrategy adds only the binding-2 entry).
    return buildDedicatedMainBlockConfig(rendererConfig, densityGridSize, {
      isBifurcationHorizon: true,
    })
  }

  if (isModularKnot) {
    // Modular Knot: dedicated 3D-texture volumetric main block sampling the
    // group-2 baked RGBA volume (ModularKnotStrategy adds the binding-2 texture
    // and the binding-3 sampler).
    return buildDedicatedMainBlockConfig(rendererConfig, densityGridSize, {
      isModularKnot: true,
    })
  }

  if (isWdwZetaVolume) {
    // WDW ⊗ ζ suite: one shared 3D-texture volumetric main block sampling the
    // group-2 baked RGBA volume (WdwZetaVolumeStrategy adds the binding-2 texture
    // and the binding-3 sampler). All ten suite modes share this config + shader.
    return buildDedicatedMainBlockConfig(rendererConfig, densityGridSize, {
      isWdwZetaVolume: true,
    })
  }

  return {
    dimension: rendererConfig.dimension!,
    isosurface,
    quantumMode: shaderQuantumMode,
    termCount: computeMode ? 1 : rendererConfig.termCount,
    nodal,
    nodalSpecializationEnabled: nodal,
    nodalDefinition: nodal ? (rendererConfig.nodalDefinition ?? 'psiAbs') : 'psiAbs',
    nodalRenderMode: nodal ? (rendererConfig.nodalRenderMode ?? 'band') : 'band',
    nodalFamilyFilter: nodal ? (rendererConfig.nodalFamilyFilter ?? 'all') : 'all',
    colorAlgorithm: rendererConfig.colorAlgorithm,
    temporalAccumulation: computeMode ? false : rendererConfig.temporal,
    phaseMateriality: computeMode ? false : (rendererConfig.phaseMaterialityEnabled ?? true),
    interference: computeMode ? false : (rendererConfig.interferenceEnabled ?? true),
    uncertaintyBoundary: computeMode ? false : (rendererConfig.uncertaintyBoundaryEnabled ?? true),
    useEigenfunctionCache,
    useAnalyticalGradient,
    useRobustEigenInterpolation,
    useDensityGrid,
    densityGridSize,
    densityGridHasPhase: computeMode || (useDensityGrid && openQuantumEnabled) ? true : undefined,
    isWigner: computeMode ? false : isWigner,
    useWignerCache: computeMode ? false : isWigner,
    // `isFreeScalar` is the legacy compute-mode-grid flag (box bounds,
    // density-grid raymarch, no inline fallback). All compute modes need
    // it. The strictly-FSF semantic lives in `isFreeScalarField` below
    // so binary-sign-phase and precomputed-normal gates can distinguish
    // "true FSF" from "any compute mode". WdW writes continuous phase
    // and must NOT be classified binary-sign.
    isFreeScalar: computeMode,
    isFreeScalarField,
    hasPrecomputedNormals: runtime?.hasPrecomputedNormals === true,
    isQuantumWalk: strategyKind === 'quantumWalk',
    isPauli,
    isAds: strategyKind === 'antiDeSitter',
    freeScalarAnalysis:
      isFreeScalarField && isFreeScalarAnalysisAlgorithm(rendererConfig.colorAlgorithm),
    useDensityMatrix: rendererConfig.openQuantumEnabled ?? false,
    crossSectionEnabled: rendererConfig.crossSectionEnabled ?? true,
    probabilityCurrentEnabled: rendererConfig.probabilityCurrentEnabled ?? true,
    radialProbabilityEnabled:
      !computeMode && isHydrogen && rendererConfig.radialProbabilityEnabled === true,
    bornNullWeaveEnabled: !computeMode && rendererConfig.bornNullWeaveEnabled === true,
    phaseShimmerEnabled: !computeMode && rendererConfig.phaseShimmerEnabled === true,
    phaseAnimationEnabled:
      !computeMode && isHydrogen && rendererConfig.phaseAnimationEnabled === true,
    // Compute-grid modes already precompute density/phase into textures. Their
    // default object signal is the simulated field, not scene light response, so
    // use ambient emission and avoid per-hit gradient fetches plus light loops.
    fastGridEmission: computeMode,
    quantumBackreactionLensing: rendererConfig.quantumBackreactionLensingEnabled ?? true,
    bilocalERBridge: rendererConfig.bilocalERBridgeEnabled ?? true,
    entropicTimeShear: rendererConfig.entropicTimeShearEnabled ?? true,
    spectralDimensionFlow: rendererConfig.spectralDimensionFlowEnabled ?? true,
    vacuumBubbleLens: rendererConfig.vacuumBubbleLensEnabled ?? true,
    negativeAlphaPotentialOverlay:
      rendererConfig.quantumMode === 'tdseDynamics' ||
      rendererConfig.quantumMode === 'diracEquation',
    wdwOverlay: strategyKind === 'wheelerDeWitt',
    tdseBranchColor: rendererConfig.quantumMode === 'tdseDynamics',
    adsAmplitude: strategyKind === 'antiDeSitter',
    gridPhaseOffset: strategyKind === 'antiDeSitter' || strategyKind === 'wheelerDeWitt',
    sampleSpaceRotation: runtime?.sampleSpaceRotation === true,
    // Profiling strip flags: read from window global (set by A/B benchmark tests)
    profilingStrip:
      typeof globalThis !== 'undefined'
        ? ((globalThis as Record<string, unknown>)
            .__PROFILING_STRIP__ as SchroedingerWGSLShaderConfig['profilingStrip'])
        : undefined,
  }
}

// ---------------------------------------------------------------------------
// Pipeline outputs
// ---------------------------------------------------------------------------

/**
 * Determine the render pass output resources based on the renderer config.
 * - 2D: single object-color
 * - Temporal 3D: quarter-color + quarter-position
 * - Standard 3D: object-color only
 */
export function buildPipelineOutputs(
  config?: SchrodingerRendererConfig
): { resourceId: string; access: 'write'; binding: number }[] {
  const cfg = config ?? {}
  const computeMode = isComputeQuantumMode(cfg)
  const isTemporal =
    (cfg.temporal ?? false) &&
    !computeMode &&
    cfg.quantumMode !== 'coherenceHorizon' &&
    cfg.quantumMode !== 'riemannZeta' &&
    cfg.quantumMode !== 'hilbertPolya' &&
    cfg.quantumMode !== 'bifurcationHorizon' &&
    cfg.quantumMode !== 'modularKnot' &&
    !isWdwZetaMode(cfg.quantumMode)
  const pipelineIs2D = isPipeline2D(cfg)

  if (pipelineIs2D) {
    return [{ resourceId: 'object-color', access: 'write', binding: 0 }]
  }
  if (isTemporal) {
    return [
      { resourceId: 'quarter-color', access: 'write', binding: 0 },
      { resourceId: 'quarter-position', access: 'write', binding: 1 },
    ]
  }
  return [{ resourceId: 'object-color', access: 'write', binding: 0 }]
}

// ---------------------------------------------------------------------------
// Pipeline cache key
// ---------------------------------------------------------------------------

/**
 * Compute a cache key that uniquely identifies the compiled shader + pipeline descriptor.
 * Two configs producing the same key MUST produce identical shader code and pipeline state.
 */
export function computePipelineCacheKey(
  config: SchroedingerWGSLShaderConfig,
  rendererConfig: SchrodingerRendererConfig
): string {
  const pipelineIs2D =
    (rendererConfig.dimension ?? 3) === 2 || rendererConfig.representation === 'wigner'
  const cacheOn = config.useEigenfunctionCache ? 1 : 0
  return [
    config.dimension,
    rendererConfig.representation ?? 'position',
    config.isosurface ? 1 : 0,
    config.temporalAccumulation ? 1 : 0,
    config.quantumMode ?? 'harmonicOscillator',
    config.termCount ?? -1,
    config.nodal ? 1 : 0,
    config.nodalSpecializationEnabled ? 1 : 0,
    config.nodalDefinition ?? 'psiAbs',
    config.nodalRenderMode ?? 'band',
    config.nodalFamilyFilter ?? 'all',
    config.phaseMateriality ? 1 : 0,
    config.interference ? 1 : 0,
    config.uncertaintyBoundary ? 1 : 0,
    cacheOn,
    cacheOn && config.useAnalyticalGradient ? 1 : 0,
    cacheOn && config.useRobustEigenInterpolation ? 1 : 0,
    config.colorAlgorithm ?? 4,
    config.useDensityGrid ? 1 : 0,
    config.densityGridHasPhase ? 1 : 0,
    config.densityGridSize ?? 64,
    config.isWigner ? 1 : 0,
    config.useWignerCache ? 1 : 0,
    pipelineIs2D ? 1 : 0,
    config.isFreeScalar ? 1 : 0,
    config.isFreeScalarField ? 1 : 0,
    config.hasPrecomputedNormals ? 1 : 0,
    config.isQuantumWalk ? 1 : 0,
    config.freeScalarAnalysis ? 1 : 0,
    config.useDensityMatrix ? 1 : 0,
    config.crossSectionEnabled ? 1 : 0,
    config.probabilityCurrentEnabled ? 1 : 0,
    config.radialProbabilityEnabled ? 1 : 0,
    config.bornNullWeaveEnabled ? 1 : 0,
    config.phaseShimmerEnabled ? 1 : 0,
    config.phaseAnimationEnabled ? 1 : 0,
    config.fastGridEmission ? 1 : 0,
    config.quantumBackreactionLensing ? 1 : 0,
    config.bilocalERBridge ? 1 : 0,
    config.entropicTimeShear ? 1 : 0,
    config.spectralDimensionFlow ? 1 : 0,
    config.vacuumBubbleLens ? 1 : 0,
    config.negativeAlphaPotentialOverlay ? 1 : 0,
    config.wdwOverlay ? 1 : 0,
    config.tdseBranchColor ? 1 : 0,
    config.adsAmplitude ? 1 : 0,
    config.gridPhaseOffset ? 1 : 0,
    config.isPauli ? 1 : 0,
    config.isBellPair ? 1 : 0,
    config.sampleSpaceRotation ? 1 : 0,
    config.isCoherenceHorizon ? 1 : 0,
    config.isRiemannZeta ? 1 : 0,
    config.isHilbertPolya ? 1 : 0,
    config.isBifurcationHorizon ? 1 : 0,
    config.isModularKnot ? 1 : 0,
    config.isWdwZetaVolume ? 1 : 0,
  ].join(':')
}
