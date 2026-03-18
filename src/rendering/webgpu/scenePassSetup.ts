/**
 * Render pass setup, configuration, and lifecycle for the WebGPU scene.
 *
 * Contains pass configuration types, pass setup/cleanup functions,
 * config extraction and normalization helpers, and the object renderer factory.
 *
 * @module rendering/webgpu/scenePassSetup
 */

import type { ObjectType } from '@/lib/geometry/types'
import { logger } from '@/lib/logger'
import {
  COLOR_ALGORITHM_TO_INT,
  type ColorAlgorithm as PaletteColorAlgorithm,
  getAvailableColorAlgorithms,
} from '@/rendering/shaders/palette/types'
import type { SkyboxMode } from '@/stores/defaults/visualDefaults'

import type { WebGPUFrameStats, WebGPURenderPass } from './core/types'
import { WebGPURenderGraph } from './graph/WebGPURenderGraph'
import { BloomPass } from './passes/BloomPass'
import { BufferPreviewPass } from './passes/BufferPreviewPass'
import { DebugOverlayPass } from './passes/DebugOverlayPass'
import { EnvironmentCompositePass } from './passes/EnvironmentCompositePass'
import { FrameBlendingPass } from './passes/FrameBlendingPass'
import { FXAAPass } from './passes/FXAAPass'
import { LightGizmoPass } from './passes/LightGizmoPass'
import { PaperTexturePass } from './passes/PaperTexturePass'
// Passes
import { ScenePass } from './passes/ScenePass'
import { SMAAPass } from './passes/SMAAPass'
import { ToneMappingCinematicPass } from './passes/ToneMappingCinematicPass'
import { ToScreenPass } from './passes/ToScreenPass'
import { WebGPUTemporalCloudPass } from './passes/WebGPUTemporalCloudPass'
// Object Renderers
import { WebGPUSchrodingerRenderer } from './renderers/WebGPUSchrodingerRenderer'
import { WebGPUSkyboxRenderer } from './renderers/WebGPUSkyboxRenderer'
import type { ColorAlgorithm as WGSLColorAlgorithm } from './shaders/types'
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
  quantumMode:
    | 'harmonicOscillator'
    | 'hydrogenND'
    | 'freeScalarField'
    | 'tdseDynamics'
    | 'becDynamics'
    | 'diracEquation'
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
  representation: 'position' | 'momentum' | 'wigner'
  openQuantumEnabled: boolean
  skyboxEnabled: boolean
  skyboxMode: SkyboxMode
  backgroundColor: string
}

/** Subset of PassConfig fields that trigger Schroedinger renderer rebuild when changed. */
export interface SchrodingerPassConfig {
  objectType: ObjectType
  dimension: number
  quantumMode:
    | 'harmonicOscillator'
    | 'hydrogenND'
    | 'freeScalarField'
    | 'tdseDynamics'
    | 'becDynamics'
    | 'diracEquation'
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

interface ScenePassBackgroundColorUpdateArgs {
  graph: Pick<WebGPURenderGraph, 'getPass'>
  skyboxEnabled: boolean
  backgroundColor: string
}

interface ToScreenPassSharpnessUpdateArgs {
  graph: Pick<WebGPURenderGraph, 'getPass'>
  renderResolutionScale: number
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

/** @returns Color algorithm valid for the given quantum mode, falling back to a sensible default. */
export function normalizeColorAlgorithmForQuantumMode(
  quantumMode: PassConfig['quantumMode'],
  colorAlgorithm: PaletteColorAlgorithm,
  openQuantumEnabled: boolean = false,
  diracFieldView?: string,
  _pauliFieldView?: string,
  objectType: string = 'schroedinger'
): PaletteColorAlgorithm {
  if (quantumMode === 'diracEquation' && diracFieldView === 'particleAntiparticleSplit') {
    return 'particleAntiparticle'
  }

  const isAvailable = getAvailableColorAlgorithms(quantumMode, openQuantumEnabled, objectType).some(
    (option) => option.value === colorAlgorithm
  )
  if (isAvailable) return colorAlgorithm

  if (openQuantumEnabled) return 'purityMap'
  if (objectType === 'pauliSpinor') return 'pauliSpinDensity'
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

/** @returns Normalized Schroedinger-specific config with compute-mode overrides applied. */
export function extractSchrodingerConfig(config: PassConfig): SchrodingerPassConfig {
  const isFreeScalar = config.quantumMode === 'freeScalarField'
  const isTdse = config.quantumMode === 'tdseDynamics'
  const isBec = config.quantumMode === 'becDynamics'
  const isDirac = config.quantumMode === 'diracEquation'
  const isPauli = config.objectType === 'pauliSpinor'
  const isComputeMode = isFreeScalar || isTdse || isBec || isDirac || isPauli
  // 2D pipelines (dim=2 or Wigner) disable temporal, eigenfunction cache, etc.
  // Must match applyModeOverrides in rendererConfigUtils.ts
  const is2D = !isComputeMode && (config.dimension === 2 || config.representation === 'wigner')
  const normalizedColorAlgorithm = normalizeColorAlgorithmForQuantumMode(
    config.quantumMode,
    config.colorAlgorithm,
    config.openQuantumEnabled,
    config.diracFieldView,
    isPauli ? config.pauliFieldView : undefined,
    config.objectType
  )
  return {
    objectType: config.objectType,
    dimension: isComputeMode ? Math.max(config.dimension, 3) : config.dimension,
    quantumMode: config.quantumMode,
    termCount: isComputeMode ? 1 : config.termCount,
    colorAlgorithm: normalizedColorAlgorithm,
    isosurface: config.isosurface,
    nodalEnabled: isComputeMode || config.openQuantumEnabled ? false : config.nodalEnabled,
    phaseMaterialityEnabled:
      isComputeMode || config.openQuantumEnabled ? false : config.phaseMaterialityEnabled,
    interferenceEnabled:
      isComputeMode || config.openQuantumEnabled ? false : config.interferenceEnabled,
    uncertaintyBoundaryEnabled: isComputeMode ? false : config.uncertaintyBoundaryEnabled,
    representation: isComputeMode ? 'position' : config.representation,
    eigenfunctionCacheEnabled: isComputeMode || is2D ? false : config.eigenfunctionCacheEnabled,
    analyticalGradientEnabled: isComputeMode || is2D ? false : config.analyticalGradientEnabled,
    fastEigenInterpolationEnabled:
      isComputeMode || is2D ? false : config.fastEigenInterpolationEnabled,
    temporalReprojectionEnabled: isComputeMode || is2D ? false : config.temporalReprojectionEnabled,
    openQuantumEnabled: isComputeMode ? false : config.openQuantumEnabled,
  }
}

/** @returns Post-processing fields extracted from the full pass config. */
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

  const computeModes = new Set(['freeScalarField', 'tdseDynamics', 'becDynamics', 'diracEquation'])
  return computeModes.has(previous.quantumMode) || computeModes.has(next.quantumMode)
}

// ============================================================================
// Runtime Updates (no rebuild)
// ============================================================================

/**
 * Compute CAS sharpening intensity from render resolution scale.
 *
 * Below 95% render scale, sharpening increases as scale decreases:
 * `min(0.7, (1 - scale) * 1.5)`.
 */
export function computeCasSharpnessFromRenderScale(renderResolutionScale: number): number {
  const normalizedScale = Number.isFinite(renderResolutionScale)
    ? Math.max(0, Math.min(1, renderResolutionScale))
    : 1

  if (normalizedScale >= 0.95) return 0

  return Math.min(0.7, (1 - normalizedScale) * 1.5)
}

/**
 * Update ScenePass clear color at runtime without rebuilding passes/pipelines.
 */
export function updateScenePassBackgroundColor({
  graph,
  skyboxEnabled,
  backgroundColor,
}: ScenePassBackgroundColorUpdateArgs): void {
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

/**
 * Update ToScreen CAS sharpness at runtime without rebuilding passes/pipelines.
 */
export function updateToScreenPassSharpness({
  graph,
  renderResolutionScale,
}: ToScreenPassSharpnessUpdateArgs): void {
  const toScreenPass = graph.getPass('toScreen')
  if (!(toScreenPass instanceof ToScreenPass)) return

  toScreenPass.setSharpness(computeCasSharpnessFromRenderScale(renderResolutionScale))
}

// ============================================================================
// Pass Setup & Cleanup
// ============================================================================

/** Safely add a pass -- logs and continues on failure instead of aborting the pipeline. */
async function safeAddPass(
  graph: WebGPURenderGraph,
  pass: WebGPURenderPass,
  label: string,
  shouldAbort?: () => boolean
): Promise<boolean> {
  if (shouldAbort?.()) return false

  const graphLike = graph as unknown as {
    getPass?: (id: string) => WebGPURenderPass | undefined
    removePass?: (id: string) => void
  }
  const getPass = typeof graphLike.getPass === 'function' ? graphLike.getPass.bind(graphLike) : null
  const removePass =
    typeof graphLike.removePass === 'function' ? graphLike.removePass.bind(graphLike) : null

  try {
    const existing = getPass?.(pass.id)
    if (existing && removePass) {
      removePass(pass.id)
      if (shouldAbort?.()) return false
    }

    await graph.addPass(pass)

    if (shouldAbort?.()) {
      if (getPass && removePass && getPass(pass.id) === pass) {
        removePass(pass.id)
      }
      return false
    }

    return getPass ? getPass(pass.id) === pass : true
  } catch (err) {
    logger.error(`[WebGPU setupRenderPasses] Failed to add pass '${label}':`, err)
    return false
  }
}

/**
 * Register always-present GPU resources needed by both pass groups.
 * Called once on initial setup or after a full rebuild.
 */
export function setupSharedResources(graph: WebGPURenderGraph, config: PassConfig): void {
  const useTemporalCloudAccumulation =
    config.objectType === 'schroedinger' && config.temporalReprojectionEnabled

  graph.addResource('scene-render', {
    type: 'texture',
    format: 'rgba16float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  })

  graph.addResource('object-color', {
    type: 'texture',
    format: 'rgba16float',
    usage:
      GPUTextureUsage.RENDER_ATTACHMENT |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_SRC,
  })

  if (useTemporalCloudAccumulation) {
    graph.addResource('quarter-color', {
      type: 'texture',
      size: { mode: 'fraction', fraction: 0.5 },
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })
    graph.addResource('quarter-position', {
      type: 'texture',
      size: { mode: 'fraction', fraction: 0.5 },
      format: 'rgba32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })
  }

  graph.addResource('hdr-color', {
    type: 'texture',
    format: 'rgba16float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  })

  graph.addResource('depth-buffer', {
    type: 'texture',
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  })

  graph.addResource('ldr-color', {
    type: 'texture',
    format: 'rgba8unorm',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  })

  graph.addResource('final-color', {
    type: 'texture',
    format: 'rgba8unorm',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  })
}

/** Set up Schroedinger-group passes: object renderer + temporal cloud accumulation. */
export async function setupSchrodingerPasses(
  graph: WebGPURenderGraph,
  config: PassConfig,
  shouldAbort?: () => boolean
): Promise<void> {
  if (shouldAbort?.()) return

  const useTemporalCloudAccumulation =
    config.objectType === 'schroedinger' && config.temporalReprojectionEnabled

  const objectRenderer = createObjectRenderer(config.objectType, config)
  if (objectRenderer) {
    await safeAddPass(graph, objectRenderer, `object-renderer(${config.objectType})`, shouldAbort)
  }

  if (useTemporalCloudAccumulation) {
    await safeAddPass(
      graph,
      new WebGPUTemporalCloudPass({
        quarterColorInput: 'quarter-color',
        quarterPositionInput: 'quarter-position',
        outputResource: 'object-color',
      }),
      'temporal-cloud',
      shouldAbort
    )
  }
}

/** Warm swap: pre-init Schroedinger passes in background, then atomically replace old ones. */
export async function warmSwapSchrodingerPasses(
  graph: WebGPURenderGraph,
  config: PassConfig,
  shouldAbort?: () => boolean
): Promise<void> {
  if (shouldAbort?.()) return

  const setupCtx = graph.getSetupContext()
  if (!setupCtx) {
    await setupSchrodingerPasses(graph, config, shouldAbort)
    return
  }

  const useTemporalCloudAccumulation =
    config.objectType === 'schroedinger' && config.temporalReprojectionEnabled

  const newRenderer = createObjectRenderer(config.objectType, config)
  const newTemporalPass = useTemporalCloudAccumulation
    ? new WebGPUTemporalCloudPass({
        quarterColorInput: 'quarter-color',
        quarterPositionInput: 'quarter-position',
        outputResource: 'object-color',
      })
    : null

  try {
    if (newRenderer) {
      await newRenderer.initialize(setupCtx)
      if (shouldAbort?.()) {
        newRenderer.dispose()
        newTemporalPass?.dispose()
        return
      }
    }
    if (newTemporalPass) {
      await newTemporalPass.initialize(setupCtx)
      if (shouldAbort?.()) {
        newRenderer?.dispose()
        newTemporalPass.dispose()
        return
      }
    }
  } catch (err) {
    logger.error('[WebGPU warmSwap] Pass pre-initialization failed:', err)
    newRenderer?.dispose()
    newTemporalPass?.dispose()
    throw err
  }

  if (newRenderer) {
    graph.addInitializedPass(newRenderer)
  }
  if (newTemporalPass) {
    graph.addInitializedPass(newTemporalPass)
  }
}

/** Set up post-processing passes: scene, environment composite, bloom, tonemapping, AA, etc. */
export async function setupPPPasses(
  graph: WebGPURenderGraph,
  config: PassConfig,
  shouldAbort?: () => boolean
): Promise<void> {
  if (shouldAbort?.()) return

  const useTemporalCloudAccumulation =
    config.objectType === 'schroedinger' && config.temporalReprojectionEnabled
  const backgroundLinear = parseHexColorToLinearRgb(config.backgroundColor, [0, 0, 0])

  if (config.skyboxEnabled) {
    await safeAddPass(
      graph,
      new WebGPUSkyboxRenderer({
        mode: config.skyboxMode,
        sun: false,
        vignette: false,
      }),
      'skybox',
      shouldAbort
    )
  } else {
    await safeAddPass(
      graph,
      new ScenePass({
        outputResource: 'scene-render',
        depthResource: 'depth-buffer',
        mode: 'clear',
        clearColor: {
          r: backgroundLinear[0],
          g: backgroundLinear[1],
          b: backgroundLinear[2],
          a: 1,
        },
      }),
      'scene-pass',
      shouldAbort
    )
  }

  await safeAddPass(
    graph,
    new EnvironmentCompositePass({
      lensedEnvironmentInput: 'scene-render',
      mainObjectInput: 'object-color',
      mainObjectDepthInput: 'depth-buffer',
      outputResource: 'hdr-color',
    }),
    'environment-composite',
    shouldAbort
  )

  let currentHDRBuffer = 'hdr-color'

  if (config.bloomEnabled) {
    graph.addResource('bloom-output', {
      type: 'texture',
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })

    const ok = await safeAddPass(
      graph,
      new BloomPass({
        inputResource: currentHDRBuffer,
        bloomInputResource: 'object-color',
        outputResource: 'bloom-output',
      }),
      'bloom',
      shouldAbort
    )
    if (ok) currentHDRBuffer = 'bloom-output'
  }

  if (config.frameBlendingEnabled) {
    graph.addResource('frame-blend-output', {
      type: 'texture',
      format: 'rgba16float',
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC,
    })

    const ok = await safeAddPass(
      graph,
      new FrameBlendingPass({
        colorInput: currentHDRBuffer,
        outputResource: 'frame-blend-output',
        blendFactor: 0.15,
      }),
      'frame-blending',
      shouldAbort
    )
    if (ok) currentHDRBuffer = 'frame-blend-output'
  }

  await safeAddPass(
    graph,
    new ToneMappingCinematicPass({
      colorInput: currentHDRBuffer,
      outputResource: 'ldr-color',
    }),
    'tonemapping-cinematic',
    shouldAbort
  )

  let currentLDRBuffer = 'ldr-color'

  if (config.paperEnabled) {
    graph.addResource('paper-output', {
      type: 'texture',
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })

    const ok = await safeAddPass(
      graph,
      new PaperTexturePass({
        colorInput: currentLDRBuffer,
        outputResource: 'paper-output',
      }),
      'paper-texture',
      shouldAbort
    )
    if (ok) currentLDRBuffer = 'paper-output'
  }

  if (config.antiAliasingMethod === 'fxaa') {
    const ok = await safeAddPass(
      graph,
      new FXAAPass({
        colorInput: currentLDRBuffer,
        outputResource: 'final-color',
        subpixelQuality: 0.75,
      }),
      'fxaa',
      shouldAbort
    )
    if (ok) currentLDRBuffer = 'final-color'
  } else if (config.antiAliasingMethod === 'smaa') {
    const ok = await safeAddPass(
      graph,
      new SMAAPass({
        colorInput: currentLDRBuffer,
        outputResource: 'final-color',
        threshold: 0.1,
        maxSearchSteps: 16,
      }),
      'smaa',
      shouldAbort
    )
    if (ok) currentLDRBuffer = 'final-color'
  }

  await safeAddPass(
    graph,
    new ToScreenPass({
      inputResource: currentLDRBuffer,
      gammaCorrection: true,
      sharpness: computeCasSharpnessFromRenderScale(config.renderResolutionScale ?? 1),
    }),
    'to-screen',
    shouldAbort
  )

  const bufferPreviewInputs = ['depth-buffer']
  if (useTemporalCloudAccumulation) {
    bufferPreviewInputs.push('quarter-position')
  }
  await safeAddPass(
    graph,
    new BufferPreviewPass({
      bufferInput: 'depth-buffer',
      additionalInputs: bufferPreviewInputs.length > 1 ? bufferPreviewInputs.slice(1) : undefined,
      bufferType: 'depth',
      depthMode: 'linear',
    }),
    'buffer-preview',
    shouldAbort
  )

  graph.addResource('gizmo-texture', {
    type: 'texture',
    format: 'rgba8unorm',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  })

  await safeAddPass(
    graph,
    new LightGizmoPass({ outputResource: 'gizmo-texture' }),
    'light-gizmo',
    shouldAbort
  )

  await safeAddPass(
    graph,
    new DebugOverlayPass({ debugInput: 'gizmo-texture' }),
    'debug-overlay',
    shouldAbort
  )
}

/** Remove Schroedinger-group passes that should no longer exist. */
export function cleanupSchrodingerPasses(graph: WebGPURenderGraph, config: PassConfig): void {
  const useTemporalCloud =
    config.objectType === 'schroedinger' && config.temporalReprojectionEnabled
  if (!useTemporalCloud) {
    if (graph.getPass('temporal-cloud')) graph.removePass('temporal-cloud')
  }
}

/** Remove PP-group passes and resources that should no longer exist. */
export function cleanupPPPasses(graph: WebGPURenderGraph, config: PassConfig): void {
  if (!config.bloomEnabled) {
    if (graph.getPass('bloom')) graph.removePass('bloom')
    graph.removeResource('bloom-output')
  }
  if (!config.frameBlendingEnabled) {
    if (graph.getPass('frame-blending')) graph.removePass('frame-blending')
    graph.removeResource('frame-blend-output')
  }
  if (!config.paperEnabled) {
    if (graph.getPass('paper-texture')) graph.removePass('paper-texture')
    graph.removeResource('paper-output')
  }
  if (config.antiAliasingMethod !== 'fxaa' && graph.getPass('fxaa')) {
    graph.removePass('fxaa')
  }
  if (config.antiAliasingMethod !== 'smaa' && graph.getPass('smaa')) {
    graph.removePass('smaa')
  }
  if (config.skyboxEnabled && graph.getPass('scene')) {
    graph.removePass('scene')
  }
  if (!config.skyboxEnabled && graph.getPass('skybox')) {
    graph.removePass('skybox')
  }
}

/** Pre-swap: add temporal resources if the new config requires them. Safe before warm swap. */
export function ensureTemporalResources(graph: WebGPURenderGraph, config: PassConfig): void {
  const needsTemporal = config.objectType === 'schroedinger' && config.temporalReprojectionEnabled

  if (needsTemporal) {
    graph.addResource('quarter-color', {
      type: 'texture',
      size: { mode: 'fraction', fraction: 0.5 },
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })
    graph.addResource('quarter-position', {
      type: 'texture',
      size: { mode: 'fraction', fraction: 0.5 },
      format: 'rgba32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })
  }
}

/** Post-swap: remove temporal resources if no longer needed. Only call after new pass is active. */
export function removeStaleTemporalResources(graph: WebGPURenderGraph, config: PassConfig): void {
  const needsTemporal = config.objectType === 'schroedinger' && config.temporalReprojectionEnabled

  if (!needsTemporal) {
    graph.removeResource('quarter-color')
    graph.removeResource('quarter-position')
  }
}

/**
 * Set up render passes for the WebGPU pipeline.
 */
export async function setupRenderPasses(
  graph: WebGPURenderGraph,
  config: PassConfig,
  shouldAbort?: () => boolean
): Promise<void> {
  if (shouldAbort?.()) return

  setupSharedResources(graph, config)
  if (shouldAbort?.()) return

  await setupSchrodingerPasses(graph, config, shouldAbort)
  if (shouldAbort?.()) return

  await setupPPPasses(graph, config, shouldAbort)
}

/**
 * Create the appropriate object renderer based on object type.
 * @param objectType - The type of object to render
 * @param config - Pass configuration including shader feature flags from stores
 * @returns The Schroedinger renderer pass or null if not supported
 */
export function createObjectRenderer(objectType: ObjectType, config: PassConfig) {
  const {
    dimension,
    isosurface,
    quantumMode,
    termCount,
    nodalEnabled,
    phaseMaterialityEnabled,
    interferenceEnabled,
    uncertaintyBoundaryEnabled,
  } = config
  const normalizedColorAlgorithm = normalizeColorAlgorithmForQuantumMode(
    quantumMode,
    config.colorAlgorithm,
    config.openQuantumEnabled,
    config.diracFieldView,
    config.objectType === 'pauliSpinor' ? config.pauliFieldView : undefined,
    config.objectType
  )
  const colorAlgorithm = COLOR_ALGORITHM_TO_INT[normalizedColorAlgorithm] as
    | WGSLColorAlgorithm
    | undefined
  const useTemporalCloudAccumulation =
    objectType === 'schroedinger' && config.temporalReprojectionEnabled

  switch (objectType) {
    case 'schroedinger':
      return new WebGPUSchrodingerRenderer({
        dimension,
        isosurface,
        quantumMode,
        termCount,
        colorAlgorithm,
        nodalEnabled,
        phaseMaterialityEnabled,
        interferenceEnabled,
        uncertaintyBoundaryEnabled,
        temporal: useTemporalCloudAccumulation,
        eigenfunctionCacheEnabled: config.eigenfunctionCacheEnabled,
        analyticalGradientEnabled: config.analyticalGradientEnabled,
        fastEigenInterpolationEnabled: config.fastEigenInterpolationEnabled,
        representation: config.representation,
        openQuantumEnabled: config.openQuantumEnabled,
      })

    case 'pauliSpinor':
      return new WebGPUSchrodingerRenderer({
        dimension,
        isosurface: false,
        quantumMode: 'tdseDynamics',
        termCount: 1,
        colorAlgorithm,
        nodalEnabled: false,
        phaseMaterialityEnabled: false,
        interferenceEnabled: false,
        uncertaintyBoundaryEnabled: false,
        temporal: false,
        eigenfunctionCacheEnabled: false,
        analyticalGradientEnabled: false,
        fastEigenInterpolationEnabled: false,
        representation: 'position',
        openQuantumEnabled: false,
        isPauli: true,
      })

    default:
      logger.warn(`WebGPU: No renderer for object type '${objectType}'`)
      return null
  }
}
