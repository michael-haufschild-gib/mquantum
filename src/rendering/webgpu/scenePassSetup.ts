/**
 * Render pass setup, cleanup, and lifecycle for the WebGPU scene.
 *
 * Pass construction, graph resource registration, and warm-swap logic.
 * Config types and normalization live in scenePassConfig.ts.
 *
 * @module rendering/webgpu/scenePassSetup
 */

import type { ObjectType } from '@/lib/geometry/types'
import { logger } from '@/lib/logger'

import type { WebGPURenderPass } from './core/types'
import { WebGPURenderGraph } from './graph/WebGPURenderGraph'
import { BloomPass } from './passes/BloomPass'
import { BufferPreviewPass } from './passes/BufferPreviewPass'
import { DebugOverlayPass } from './passes/DebugOverlayPass'
import { EnvironmentCompositePass } from './passes/EnvironmentCompositePass'
import { FrameBlendingPass } from './passes/FrameBlendingPass'
import { FXAAPass } from './passes/FXAAPass'
import { LightGizmoPass } from './passes/LightGizmoPass'
import { PaperTexturePass } from './passes/PaperTexturePass'
import { ScenePass } from './passes/ScenePass'
import { SMAAPass } from './passes/SMAAPass'
import { ToneMappingCinematicPass } from './passes/ToneMappingCinematicPass'
import { ToScreenPass } from './passes/ToScreenPass'
import { WebGPUTemporalCloudPass } from './passes/WebGPUTemporalCloudPass'
import { WebGPUSchrodingerRenderer } from './renderers/WebGPUSchrodingerRenderer'
import { WebGPUSkyboxRenderer } from './renderers/WebGPUSkyboxRenderer'
import {
  computeCasSharpnessFromRenderScale,
  type PassConfig,
  resolveColorAlgorithmInt,
} from './scenePassConfig'
import { parseHexColorToLinearRgb } from './utils/color'

// Re-export everything from scenePassConfig so existing consumers keep working
export {
  computeCasSharpnessFromRenderScale,
  executeFrameAndCollectMetrics,
  extractPPConfig,
  extractSchrodingerConfig,
  type FrameMetricsArgs,
  normalizeColorAlgorithmForQuantumMode,
  type PassConfig,
  pauliFieldViewForColorAlgorithm,
  type PPPassConfig,
  type SchrodingerPassConfig,
  shallowEqual,
  shouldForceFullRebuildForQuantumModeTransition,
  updateScenePassBackgroundColor,
  updateToScreenPassSharpness,
} from './scenePassConfig'

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

/** Pre-swap: add temporal resources if the new config requires them. */
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

/** Post-swap: remove temporal resources if no longer needed. */
export function removeStaleTemporalResources(graph: WebGPURenderGraph, config: PassConfig): void {
  const needsTemporal = config.objectType === 'schroedinger' && config.temporalReprojectionEnabled

  if (!needsTemporal) {
    graph.removeResource('quarter-color')
    graph.removeResource('quarter-position')
  }
}

/** Set up all render passes for the WebGPU pipeline. */
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
 *
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
  const colorAlgorithm = resolveColorAlgorithmInt(config)
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
