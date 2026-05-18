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

import type { WebGPURenderPass, WebGPUSetupContext } from './core/types'
import { WebGPURenderGraph } from './graph/WebGPURenderGraph'
import { WebGPUTemporalCloudPass } from './passes/WebGPUTemporalCloudPass'
import { WebGPUSchrodingerRenderer } from './renderers/WebGPUSchrodingerRenderer'
import { type PassConfig, resolveColorAlgorithmInt } from './scenePassConfig'
import { constructPPPasses, registerPasses } from './scenePassConstruction'

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

  try {
    const existing = graph.getPass(pass.id)
    if (existing) {
      graph.removePass(pass.id)
      if (shouldAbort?.()) return false
    }

    await graph.addPass(pass)

    if (shouldAbort?.()) {
      if (graph.getPass(pass.id) === pass) {
        graph.removePass(pass.id)
      }
      return false
    }

    return graph.getPass(pass.id) === pass
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

  // Adopt compute state from the old renderer BEFORE initialization.
  // This preserves simulation state (coin buffers, density textures) across
  // pipeline rebuilds triggered by non-structural changes (e.g. color algorithm).
  //
  // adoptFrom() only stashes a reference to the predecessor's strategy — the actual
  // state transfer happens during createPipeline() inside initialize(). Between these
  // two points the old renderer keeps rendering with its strategy intact. If init
  // aborts or throws, dispose() on the new renderer cleans up the stashed reference.
  //
  // If initialize() completes (or throws partway through createPipeline), compute state
  // has already transferred from predecessor → newRenderer. On any abort/error path we
  // must reclaim it via revertComputeStateTo(predecessor) BEFORE disposing newRenderer,
  // otherwise strategy.dispose() destroys GPU state the predecessor is still using.
  const existingPass = graph.getPass('schroedinger')
  if (newRenderer && existingPass) {
    newRenderer.adoptFrom(existingPass)
  }

  const disposeNewRendererSafely = () => {
    if (!newRenderer) return
    if (existingPass) {
      newRenderer.revertComputeStateTo(existingPass)
    }
    newRenderer.dispose()
  }

  try {
    if (newRenderer) {
      await newRenderer.initialize(setupCtx)
      if (shouldAbort?.()) {
        disposeNewRendererSafely()
        newTemporalPass?.dispose()
        return
      }
    }
    if (newTemporalPass) {
      await newTemporalPass.initialize(setupCtx)
      if (shouldAbort?.()) {
        disposeNewRendererSafely()
        newTemporalPass.dispose()
        return
      }
    }
  } catch (err) {
    logger.error('[WebGPU warmSwap] Pass pre-initialization failed:', err)
    disposeNewRendererSafely()
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

/**
 * Pre-initialize a pass (compile shaders), returning the initialized pass or null on failure.
 * Does NOT add the pass to the graph — caller registers it after all passes are ready.
 */
async function preInitPass<T extends WebGPURenderPass>(
  pass: T,
  setupCtx: WebGPUSetupContext,
  label: string
): Promise<T | null> {
  try {
    await pass.initialize(setupCtx)
    return pass
  } catch (err) {
    logger.error(`[WebGPU setupRenderPasses] Failed to pre-init pass '${label}':`, err)
    pass.dispose()
    return null
  }
}

/**
 * Sequential PP pass setup — adds passes one-at-a-time via `safeAddPass`.
 * Used when `getSetupContext()` returns null (graph not yet initialized,
 * or test environments without a real GPUDevice).
 *
 * Reuses `constructPPPasses` for the pass list so there is a single
 * source of truth for which passes exist and in what order.
 */
async function setupPPPassesSequential(
  graph: WebGPURenderGraph,
  config: PassConfig,
  shouldAbort?: () => boolean
): Promise<void> {
  const passes = await constructPPPasses(config)

  for (const { pass, label, resource } of passes) {
    if (shouldAbort?.()) return

    if (resource) {
      graph.addResource(resource.name, {
        type: 'texture',
        format: resource.format,
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT |
          GPUTextureUsage.TEXTURE_BINDING |
          (resource.extraUsage ?? 0),
      })
    }

    await safeAddPass(graph, pass, label, shouldAbort)
  }
}

/** Set up post-processing passes: scene, environment composite, bloom, tonemapping, AA, etc. */
export async function setupPPPasses(
  graph: WebGPURenderGraph,
  config: PassConfig,
  shouldAbort?: () => boolean
): Promise<void> {
  if (shouldAbort?.()) return

  // getSetupContext may not exist on test mocks; also may return null before device init
  const setupCtx = typeof graph.getSetupContext === 'function' ? graph.getSetupContext() : null
  const canParallelInit = setupCtx !== null && typeof graph.addInitializedPass === 'function'

  // Fall back to sequential safeAddPass when setup context is unavailable (tests, early init)
  if (!canParallelInit) {
    return setupPPPassesSequential(graph, config, shouldAbort)
  }

  const passes = await constructPPPasses(config)

  // Phase 1: Pre-initialize all passes in parallel (shader compilation)
  const initializedPasses = !shouldAbort?.()
    ? await Promise.all(passes.map(({ pass, label }) => preInitPass(pass, setupCtx, label)))
    : []

  if (shouldAbort?.()) {
    passes.forEach(({ pass }) => pass.dispose())
    return
  }

  const initializedSet = new Set(
    initializedPasses.filter((pass): pass is WebGPURenderPass => pass !== null)
  )
  const readyPasses = passes.filter(({ pass }) => initializedSet.has(pass))
  if (readyPasses.length === 0) return

  // Phase 2: Register in pipeline order
  registerPasses(graph, readyPasses)
}

/** Remove Schroedinger-group passes that should no longer exist. */
export function cleanupSchrodingerPasses(graph: WebGPURenderGraph, config: PassConfig): void {
  const useTemporalCloud =
    config.objectType === 'schroedinger' && config.temporalReprojectionEnabled
  if (!useTemporalCloud) {
    if (graph.getPass('temporal-cloud')) graph.removePass('temporal-cloud')
    if (graph.getPass('bufferPreview')) graph.removePass('bufferPreview')
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

/** Pauli spinor uses the TDSE lattice engine with all analytic features disabled. */
const PAULI_RENDERER_OVERRIDES = {
  quantumMode: 'tdseDynamics' as const,
  termCount: 1 as const,
  nodalEnabled: false,
  phaseMaterialityEnabled: false,
  interferenceEnabled: false,
  uncertaintyBoundaryEnabled: false,
  temporal: false,
  eigenfunctionCacheEnabled: false,
  analyticalGradientEnabled: false,
  fastEigenInterpolationEnabled: false,
  representation: 'position' as const,
  openQuantumEnabled: false,
  isPauli: true,
  crossSectionEnabled: false,
  probabilityCurrentEnabled: false,
  radialProbabilityEnabled: false,
  bornNullWeaveEnabled: false,
  phaseShimmerEnabled: false,
  phaseAnimationEnabled: false,
  quantumBackreactionLensingEnabled: false,
  bilocalERBridgeEnabled: false,
  entropicTimeShearEnabled: false,
  spectralDimensionFlowEnabled: false,
  vacuumBubbleLensEnabled: false,
}

/**
 * Bell-pair piggy-backs on the same shared renderer scaffold as Pauli: it
 * needs no analytic / quantum-effect shader branches, just the volume
 * raymarcher and the canvas bind-group plumbing. The strategy supplies the
 * actual compute pass and trial-loop driver.
 */
const BELL_PAIR_RENDERER_OVERRIDES = {
  isosurface: false,
  quantumMode: 'tdseDynamics' as const,
  termCount: 1 as const,
  nodalEnabled: false,
  phaseMaterialityEnabled: false,
  interferenceEnabled: false,
  uncertaintyBoundaryEnabled: false,
  temporal: false,
  eigenfunctionCacheEnabled: false,
  analyticalGradientEnabled: false,
  fastEigenInterpolationEnabled: false,
  representation: 'position' as const,
  openQuantumEnabled: false,
  isPauli: false,
  isBellPair: true,
  crossSectionEnabled: false,
  probabilityCurrentEnabled: false,
  radialProbabilityEnabled: false,
  bornNullWeaveEnabled: false,
  phaseShimmerEnabled: false,
  phaseAnimationEnabled: false,
  quantumBackreactionLensingEnabled: false,
  bilocalERBridgeEnabled: false,
  entropicTimeShearEnabled: false,
  spectralDimensionFlowEnabled: false,
  vacuumBubbleLensEnabled: false,
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
    nodalDefinition,
    nodalRenderMode,
    nodalFamilyFilter,
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
        nodalDefinition,
        nodalRenderMode,
        nodalFamilyFilter,
        phaseMaterialityEnabled,
        interferenceEnabled,
        uncertaintyBoundaryEnabled,
        temporal: useTemporalCloudAccumulation,
        eigenfunctionCacheEnabled: config.eigenfunctionCacheEnabled,
        analyticalGradientEnabled: config.analyticalGradientEnabled,
        fastEigenInterpolationEnabled: config.fastEigenInterpolationEnabled,
        representation: config.representation,
        openQuantumEnabled: config.openQuantumEnabled,
        crossSectionEnabled: config.crossSectionEnabled,
        probabilityCurrentEnabled: config.probabilityCurrentEnabled,
        radialProbabilityEnabled: config.radialProbabilityEnabled,
        bornNullWeaveEnabled: config.bornNullWeaveEnabled,
        phaseShimmerEnabled: config.phaseShimmerEnabled,
        phaseAnimationEnabled: config.phaseAnimationEnabled,
        quantumBackreactionLensingEnabled: config.quantumBackreactionLensingEnabled,
        bilocalERBridgeEnabled: config.bilocalERBridgeEnabled,
        entropicTimeShearEnabled: config.entropicTimeShearEnabled,
        spectralDimensionFlowEnabled: config.spectralDimensionFlowEnabled,
        vacuumBubbleLensEnabled: config.vacuumBubbleLensEnabled,
        densityGridResolution: config.densityGridResolution,
      })

    case 'pauliSpinor':
      return new WebGPUSchrodingerRenderer({
        dimension,
        isosurface,
        colorAlgorithm,
        densityGridResolution: config.densityGridResolution,
        ...PAULI_RENDERER_OVERRIDES,
      })

    case 'bellPair':
      return new WebGPUSchrodingerRenderer({
        dimension,
        colorAlgorithm,
        densityGridResolution: config.densityGridResolution,
        ...BELL_PAIR_RENDERER_OVERRIDES,
      })

    default:
      logger.warn(`WebGPU: No renderer for object type '${objectType}'`)
      return null
  }
}
