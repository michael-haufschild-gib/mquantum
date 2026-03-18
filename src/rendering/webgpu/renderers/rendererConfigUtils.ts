/**
 * Configuration utilities for the Schrodinger renderer.
 *
 * Pure functions that derive shader configs, pipeline outputs, and cache keys
 * from the renderer configuration. No GPU resources or class state.
 *
 * @module rendering/webgpu/renderers/rendererConfigUtils
 */

import type {
  QuantumModeForShader,
  SchroedingerWGSLShaderConfig,
} from '../shaders/schroedinger/compose'
import type { SchrodingerRendererConfig } from './schrodingerRendererTypes'

// ---------------------------------------------------------------------------
// Mode classification helpers
// ---------------------------------------------------------------------------

/** Whether the quantum mode uses a compute-pass density grid instead of analytic evaluation. */
export function isComputeQuantumMode(config: SchrodingerRendererConfig): boolean {
  return (
    config.quantumMode === 'freeScalarField' ||
    config.quantumMode === 'tdseDynamics' ||
    config.quantumMode === 'becDynamics' ||
    config.quantumMode === 'diracEquation' ||
    config.isPauli === true
  )
}

/** Whether the pipeline uses a 2D fullscreen-triangle path (no vertex/index buffers). */
export function isPipeline2D(config: SchrodingerRendererConfig): boolean {
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

  if (isComputeQuantumMode(result)) {
    result.temporal = false
    if ((result.dimension ?? 3) < 3) {
      result.dimension = 3
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Shader config builder
// ---------------------------------------------------------------------------

/**
 * Derive the compile-time shader configuration from the renderer config.
 * This determines which shader blocks are included (nodal, phase materiality, etc.)
 * and controls cache/grid sizing.
 */
export function buildShaderConfig(
  rendererConfig: SchrodingerRendererConfig
): SchroedingerWGSLShaderConfig {
  const dim = rendererConfig.dimension ?? 3
  const isFreeScalar = rendererConfig.quantumMode === 'freeScalarField'
  const isPauli = rendererConfig.isPauli === true
  const computeMode = isComputeQuantumMode(rendererConfig)
  const isWigner = rendererConfig.representation === 'wigner'
  const pipelineIs2D = !computeMode && (dim === 2 || isWigner)

  const enableCache = rendererConfig.eigenfunctionCacheEnabled ?? !pipelineIs2D
  const isHydrogen = rendererConfig.quantumMode === 'hydrogenND'
  const isosurface = rendererConfig.isosurface ?? false
  const openQuantumEnabled = rendererConfig.openQuantumEnabled ?? false

  const useDensityGrid = computeMode || (!isosurface && !pipelineIs2D)
  const baseDensityGridSize = computeMode ? 96 : !useDensityGrid ? 64 : dim <= 5 ? 96 : 128
  const estimatedK = openQuantumEnabled ? (isHydrogen ? 10 : (rendererConfig.termCount ?? 4)) : 0
  const densityGridSize = openQuantumEnabled
    ? computeOpenQuantumGridSize(baseDensityGridSize, estimatedK)
    : baseDensityGridSize

  const useEigenfunctionCache = useDensityGrid || pipelineIs2D ? false : enableCache
  const useAnalyticalGradient = computeMode
    ? false
    : (rendererConfig.analyticalGradientEnabled ?? true)
  const useRobustEigenInterpolation = computeMode
    ? false
    : !(rendererConfig.fastEigenInterpolationEnabled ?? true)

  const shaderQuantumMode: QuantumModeForShader = computeMode
    ? 'harmonicOscillator'
    : (rendererConfig.quantumMode as QuantumModeForShader)

  return {
    dimension: rendererConfig.dimension!,
    isosurface: rendererConfig.isosurface,
    quantumMode: shaderQuantumMode,
    termCount: computeMode ? 1 : rendererConfig.termCount,
    nodal: computeMode ? false : (rendererConfig.nodalEnabled ?? true),
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
    densityGridHasPhase: computeMode ? true : undefined,
    isWigner: computeMode ? false : isWigner,
    useWignerCache: computeMode ? false : isWigner,
    isFreeScalar: computeMode,
    isPauli,
    freeScalarAnalysis:
      isFreeScalar &&
      rendererConfig.colorAlgorithm !== undefined &&
      rendererConfig.colorAlgorithm >= 12 &&
      rendererConfig.colorAlgorithm <= 15,
    useDensityMatrix: rendererConfig.openQuantumEnabled ?? false,
  }
}

// ---------------------------------------------------------------------------
// Pipeline outputs
// ---------------------------------------------------------------------------

/**
 * Determine the render pass output resources based on the renderer config.
 * - 2D: single object-color
 * - Temporal 3D: quarter-color + quarter-position
 * - Standard 3D: object-color + depth-buffer
 */
export function buildPipelineOutputs(
  config?: SchrodingerRendererConfig
): { resourceId: string; access: 'write'; binding: number }[] {
  const cfg = config ?? {}
  const computeMode = isComputeQuantumMode(cfg)
  const isTemporal = (cfg.temporal ?? false) && !computeMode
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
  return [
    { resourceId: 'object-color', access: 'write', binding: 0 },
    { resourceId: 'depth-buffer', access: 'write', binding: 1 },
  ]
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
    config.freeScalarAnalysis ? 1 : 0,
    config.useDensityMatrix ? 1 : 0,
  ].join(':')
}
