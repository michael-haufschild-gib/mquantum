/**
 * Scene pass configuration types, config extraction, normalization,
 * and runtime-update helpers.
 *
 * Pure logic — no pass instantiation or graph mutation.
 *
 * @module rendering/webgpu/scenePassConfig
 */

import type { SchroedingerQuantumMode } from '@/lib/geometry/extended/common'
import type { FreeScalarInitialCondition } from '@/lib/geometry/extended/freeScalar'
import { QUANTUM_TYPE_REGISTRY } from '@/lib/geometry/registry'
import type { ObjectType } from '@/lib/geometry/types'
import {
  COLOR_ALGORITHM_TO_INT,
  type ColorAlgorithm as PaletteColorAlgorithm,
  type ColorAlgorithmAvailabilityOptions,
  getAvailableColorAlgorithms,
} from '@/rendering/shaders/palette/types'
import type { SkyboxMode } from '@/stores/defaults/visualDefaults'

import type { WebGPUFrameStats } from './core/types'
import { WebGPURenderGraph } from './graph/WebGPURenderGraph'
import { ScenePass } from './passes/ScenePass'
import { ToScreenPass } from './passes/ToScreenPass'
import { parseHexColorToLinearRgb } from './utils/color'
import { WebGPUStatsCollector } from './WebGPUPerformanceCollector'

// ============================================================================
// Types
// ============================================================================

/** Arguments for frame execution and metrics collection. */
export interface FrameMetricsArgs {
  graph: WebGPURenderGraph
  collector: WebGPUStatsCollector
  deltaTime: number
  size: { width: number; height: number }
  dpr: number
}

/** Full pass configuration controlling which render passes are enabled and how they compile. */
export interface PassConfig {
  objectType: ObjectType
  dimension: number
  bloomEnabled: boolean
  antiAliasingMethod: 'none' | 'fxaa' | 'smaa'
  paperEnabled: boolean
  frameBlendingEnabled: boolean
  isosurface: boolean
  quantumMode: SchroedingerQuantumMode
  termCount: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  nodalEnabled: boolean
  phaseMaterialityEnabled: boolean
  interferenceEnabled: boolean
  uncertaintyBoundaryEnabled: boolean
  temporalReprojectionEnabled: boolean
  eigenfunctionCacheEnabled: boolean
  analyticalGradientEnabled: boolean
  fastEigenInterpolationEnabled: boolean
  renderResolutionScale?: number
  colorAlgorithm: PaletteColorAlgorithm
  diracFieldView?: string
  pauliFieldView?: string
  /**
   * Initial condition for the free scalar field mode. Threaded into the
   * normalization path so presets that carry a stale `kSpaceOccupation` under
   * `freeScalarField + vacuumNoise` (where the exact vacuum has n_k = 0 and
   * `getAvailableColorAlgorithms` intentionally hides that algorithm) are
   * corrected at runtime instead of landing on a blank map.
   *
   * Undefined for any non-freeScalarField mode; callers may also leave it
   * undefined for legacy tests that don't exercise the vacuumNoise path.
   */
  freeScalarInitialCondition?: FreeScalarInitialCondition
  representation: 'position' | 'momentum' | 'wigner'
  openQuantumEnabled: boolean
  crossSectionEnabled: boolean
  probabilityCurrentEnabled: boolean
  skyboxEnabled: boolean
  skyboxMode: SkyboxMode
  backgroundColor: string
}

/** Subset of PassConfig fields that trigger Schroedinger renderer rebuild when changed. */
export interface SchrodingerPassConfig {
  objectType: ObjectType
  dimension: number
  quantumMode: SchroedingerQuantumMode
  termCount: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  colorAlgorithm: PaletteColorAlgorithm
  isosurface: boolean
  nodalEnabled: boolean
  phaseMaterialityEnabled: boolean
  interferenceEnabled: boolean
  uncertaintyBoundaryEnabled: boolean
  representation: 'position' | 'momentum' | 'wigner'
  eigenfunctionCacheEnabled: boolean
  analyticalGradientEnabled: boolean
  fastEigenInterpolationEnabled: boolean
  temporalReprojectionEnabled: boolean
  openQuantumEnabled: boolean
  crossSectionEnabled: boolean
  probabilityCurrentEnabled: boolean
}

/** Subset of PassConfig fields that trigger post-processing pass rebuild when changed. */
export interface PPPassConfig {
  bloomEnabled: boolean
  antiAliasingMethod: 'none' | 'fxaa' | 'smaa'
  paperEnabled: boolean
  frameBlendingEnabled: boolean
  skyboxEnabled: boolean
  skyboxMode: SkyboxMode
  temporalReprojectionEnabled: boolean
}

// ============================================================================
// Frame Metrics
// ============================================================================

/**
 * Execute one render-graph frame and publish the resulting metrics to the
 * performance monitor store.
 */
export function executeFrameAndCollectMetrics({
  graph,
  collector,
  deltaTime,
  size,
  dpr,
}: FrameMetricsArgs): WebGPUFrameStats {
  const cpuStartMs = performance.now()
  const frameStats = graph.execute(deltaTime)
  const cpuTimeMs = performance.now() - cpuStartMs
  collector.recordFrame(cpuTimeMs, frameStats, graph, size, dpr)
  return frameStats
}

// ============================================================================
// Config Normalization & Extraction
// ============================================================================

/** Map a color algorithm to the Pauli writeGrid fieldView that encodes matching channels. */
export function pauliFieldViewForColorAlgorithm(algo: string): string {
  switch (algo) {
    case 'pauliSpinDensity':
      return 'spinDensity'
    case 'pauliSpinExpectation':
      return 'spinExpectation'
    case 'pauliCoherence':
      return 'coherence'
    default:
      return 'totalDensity'
  }
}

/**
 * Map a Pauli field view to its matching color algorithm. Matches the
 * inverse PAULI_FIELD_VIEW_TO_COLOR_ALGO map exported from
 * `rendering/shaders/palette/types.ts`. Kept inline so this module has
 * no cross-module dependency on that file's symbol layout.
 *
 * @internal
 */
function colorAlgoForPauliFieldView(
  pauliFieldView: string | undefined
): PaletteColorAlgorithm | null {
  switch (pauliFieldView) {
    case 'spinDensity':
      return 'pauliSpinDensity'
    case 'spinExpectation':
      return 'pauliSpinExpectation'
    case 'coherence':
      return 'pauliCoherence'
    case 'totalDensity':
      return 'blackbody'
    default:
      return null
  }
}

/** @returns Color algorithm valid for the given quantum mode, falling back to a sensible default. */
export function normalizeColorAlgorithmForQuantumMode(
  quantumMode: PassConfig['quantumMode'],
  colorAlgorithm: PaletteColorAlgorithm,
  openQuantumEnabled: boolean = false,
  diracFieldView?: string,
  pauliFieldView?: string,
  objectType: ObjectType = 'schroedinger',
  availabilityOptions?: ColorAlgorithmAvailabilityOptions,
  freeScalarInitialCondition?: FreeScalarInitialCondition
): PaletteColorAlgorithm {
  if (quantumMode === 'diracEquation' && diracFieldView === 'particleAntiparticleSplit') {
    return 'particleAntiparticle'
  }

  // Pass freeScalarInitialCondition through so `freeScalarField + vacuumNoise`
  // hides the (correctly blank) `kSpaceOccupation` map here too — otherwise
  // presets could carry it through normalization unchanged and the runtime
  // would land on an intentionally-hidden visualization.
  const isAvailable = getAvailableColorAlgorithms(
    quantumMode,
    openQuantumEnabled,
    objectType,
    freeScalarInitialCondition,
    availabilityOptions
  ).some((option) => option.value === colorAlgorithm)
  if (isAvailable) return colorAlgorithm

  if (openQuantumEnabled) return 'purityMap'
  if (objectType === 'pauliSpinor') {
    // Pauli is symmetric to Dirac's particleAntiparticleSplit handling above:
    // when a preset (or stale store state) carries a pauliFieldView that
    // expects a specific color algorithm, return THAT algorithm instead of
    // the catch-all 'pauliSpinDensity'. Without this, importing a preset
    // that set pauliFieldView='spinExpectation' under a stale colorAlgorithm
    // would silently downgrade the rendering to spinDensity even though the
    // density grid is encoding spin-expectation channels.
    const matched = colorAlgoForPauliFieldView(pauliFieldView)
    if (matched) return matched
    return 'pauliSpinDensity'
  }
  // Quantum Walk: default to phase-only coloring (constant brightness from Oklab L=0.72).
  // Density-based algorithms use the standard log-compressed brightness path.
  if (quantumMode === 'quantumWalk') return 'phaseCyclicUniform'
  if (
    quantumMode === 'tdseDynamics' ||
    quantumMode === 'becDynamics' ||
    quantumMode === 'freeScalarField' ||
    quantumMode === 'diracEquation'
  ) {
    return 'phaseDensity'
  }
  return 'radialDistance'
}

/** Compute/2D modes that are GPU-lattice or low-dim: disable analytical features. */
const COMPUTE_MODES = new Set(
  Array.from(QUANTUM_TYPE_REGISTRY.entries())
    .filter(([, e]) => e.category === 'compute' && e.internal.objectType === 'schroedinger')
    .map(([key]) => key)
)

/** Gate a config flag: return false if any disabling condition is true, otherwise pass through. */
function gate(value: boolean, ...disablers: boolean[]): boolean {
  return disablers.some(Boolean) ? false : value
}

/** @returns Normalized Schroedinger-specific config with compute-mode overrides applied. */
export function extractSchrodingerConfig(config: PassConfig): SchrodingerPassConfig {
  const isPauli = config.objectType === 'pauliSpinor'
  const isCompute = COMPUTE_MODES.has(config.quantumMode) || isPauli
  const is2D = !isCompute && (config.dimension === 2 || config.representation === 'wigner')
  const disableAnalytical = isCompute || is2D
  const disableQuantumEffect = isCompute || config.openQuantumEnabled

  // Clamp dimension to the mode's minimum from the quantum type registry.
  // All compute modes require 3D+ (no 2D density grid rendering path exists).
  const modeMinDim = isPauli
    ? (QUANTUM_TYPE_REGISTRY.get('pauliSpinor')?.dimensions.min ?? 3)
    : (QUANTUM_TYPE_REGISTRY.get(config.quantumMode)?.dimensions.min ?? 2)
  const effectiveDimension = isCompute ? Math.max(config.dimension, modeMinDim) : config.dimension

  return {
    objectType: config.objectType,
    dimension: effectiveDimension,
    quantumMode: config.quantumMode,
    termCount: isCompute ? 1 : config.termCount,
    colorAlgorithm: normalizeColorAlgorithmForQuantumMode(
      config.quantumMode,
      config.colorAlgorithm,
      config.openQuantumEnabled,
      config.diracFieldView,
      isPauli ? config.pauliFieldView : undefined,
      config.objectType,
      {
        dimension: effectiveDimension,
        isosurface: config.isosurface,
        representation: config.representation,
      },
      config.freeScalarInitialCondition
    ),
    isosurface: config.isosurface,
    representation: isCompute ? 'position' : config.representation,
    openQuantumEnabled: gate(config.openQuantumEnabled, isCompute),
    nodalEnabled: gate(config.nodalEnabled, disableQuantumEffect),
    phaseMaterialityEnabled: gate(config.phaseMaterialityEnabled, disableQuantumEffect),
    interferenceEnabled: gate(config.interferenceEnabled, disableQuantumEffect),
    uncertaintyBoundaryEnabled: gate(config.uncertaintyBoundaryEnabled, isCompute),
    eigenfunctionCacheEnabled: gate(config.eigenfunctionCacheEnabled, disableAnalytical),
    analyticalGradientEnabled: gate(config.analyticalGradientEnabled, disableAnalytical),
    fastEigenInterpolationEnabled: gate(config.fastEigenInterpolationEnabled, disableAnalytical),
    temporalReprojectionEnabled: gate(config.temporalReprojectionEnabled, disableAnalytical),
    crossSectionEnabled: gate(config.crossSectionEnabled, disableAnalytical),
    probabilityCurrentEnabled: gate(config.probabilityCurrentEnabled, disableAnalytical),
  }
}

/** @returns Post-processing config subset. */
export function extractPPConfig(config: PassConfig): PPPassConfig {
  return {
    bloomEnabled: config.bloomEnabled,
    antiAliasingMethod: config.antiAliasingMethod,
    paperEnabled: config.paperEnabled,
    frameBlendingEnabled: config.frameBlendingEnabled,
    skyboxEnabled: config.skyboxEnabled,
    skyboxMode: config.skyboxMode,
    temporalReprojectionEnabled: config.temporalReprojectionEnabled,
  }
}

/** @returns True if all keys of `b` match the corresponding values in `a`. */
export function shallowEqual<T extends object>(a: T | null, b: T): boolean {
  if (!a) return false
  const keys = Object.keys(b) as (keyof T)[]
  return keys.every((k) => a[k] === b[k])
}

/**
 * Free-scalar mode has a distinct rendering data path (lattice compute grid).
 * Warm-swapping between free-scalar and non-free-scalar keeps stale visuals visible
 * during async compilation, so these transitions should force a cold rebuild.
 */
export function shouldForceFullRebuildForQuantumModeTransition(
  previous: Pick<SchrodingerPassConfig, 'quantumMode' | 'objectType'> | null,
  next: Pick<SchrodingerPassConfig, 'quantumMode' | 'objectType'>
): boolean {
  if (!previous) return false
  if (previous.objectType !== next.objectType) return true
  if (previous.quantumMode === next.quantumMode) return false
  return COMPUTE_MODES.has(previous.quantumMode) || COMPUTE_MODES.has(next.quantumMode)
}

// ============================================================================
// Runtime Updates (no rebuild)
// ============================================================================

/**
 * Compute CAS sharpening intensity from render resolution scale.
 * Below 95% render scale, sharpening increases as scale decreases.
 */
export function computeCasSharpnessFromRenderScale(renderResolutionScale: number): number {
  const normalizedScale = Number.isFinite(renderResolutionScale)
    ? Math.max(0, Math.min(1, renderResolutionScale))
    : 1
  if (normalizedScale >= 0.95) return 0
  return Math.min(0.7, (1 - normalizedScale) * 1.5)
}

/** Update ScenePass clear color at runtime without rebuilding passes/pipelines. */
export function updateScenePassBackgroundColor({
  graph,
  skyboxEnabled,
  backgroundColor,
}: {
  graph: Pick<WebGPURenderGraph, 'getPass'>
  skyboxEnabled: boolean
  backgroundColor: string
}): void {
  if (skyboxEnabled) return
  const scenePass = graph.getPass('scene')
  if (!(scenePass instanceof ScenePass)) return
  const backgroundLinear = parseHexColorToLinearRgb(backgroundColor, [0, 0, 0])
  scenePass.setClearColor({
    r: backgroundLinear[0],
    g: backgroundLinear[1],
    b: backgroundLinear[2],
    a: 1,
  })
}

/** Update ToScreen CAS sharpness at runtime without rebuilding passes/pipelines. */
export function updateToScreenPassSharpness({
  graph,
  renderResolutionScale,
}: {
  graph: Pick<WebGPURenderGraph, 'getPass'>
  renderResolutionScale: number
}): void {
  const toScreenPass = graph.getPass('toScreen')
  if (!(toScreenPass instanceof ToScreenPass)) return
  toScreenPass.setSharpness(computeCasSharpnessFromRenderScale(renderResolutionScale))
}

/** Resolve a PaletteColorAlgorithm to the WGSL integer constant. */
export function resolveColorAlgorithmInt(config: PassConfig): number | undefined {
  const normalizedColorAlgorithm = normalizeColorAlgorithmForQuantumMode(
    config.quantumMode,
    config.colorAlgorithm,
    config.openQuantumEnabled,
    config.diracFieldView,
    config.objectType === 'pauliSpinor' ? config.pauliFieldView : undefined,
    config.objectType,
    {
      dimension: config.dimension,
      isosurface: config.isosurface,
      representation: config.representation,
    },
    config.freeScalarInitialCondition
  )
  return COLOR_ALGORITHM_TO_INT[normalizedColorAlgorithm]
}
