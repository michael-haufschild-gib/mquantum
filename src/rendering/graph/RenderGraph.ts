/**
 * Render Graph
 *
 * Main orchestrator for the declarative render graph system.
 * Manages passes, resources, compilation, and execution.
 *
 * Key responsibilities:
 * - Pass registration and lifecycle
 * - Resource registration and pool management
 * - Graph compilation (dependency resolution, ordering)
 * - Frame execution (pass invocation with context)
 * - Performance statistics collection (CPU and GPU timing)
 *
 * @module rendering/graph/RenderGraph
 */

// =============================================================================
// Debug Logging
// =============================================================================
const DEBUG_RENDER_GRAPH = () =>
  (window as unknown as { _debugRenderGraph?: boolean })._debugRenderGraph ?? false

function debugLog(category: string, ...args: unknown[]): void {
  if (DEBUG_RENDER_GRAPH()) {
    console.log(`[RenderGraph:${category}]`, ...args)
  }
}

import * as THREE from 'three'

import { ExternalBridge, type ExportConfig, type PendingExport } from './ExternalBridge'
import { ExternalResourceRegistry, type ExternalResourceConfig } from './ExternalResourceRegistry'
import type { FrozenFrameContext, StoreGetters } from './FrameContext'
import { captureFrameContext } from './FrameContext'
import { GPUTimer } from './GPUTimer'
import { GraphCompiler } from './GraphCompiler'
import { setLastFrameContext } from './lastFrameContext'
import {
  initializeGlobalMRT,
  invalidateGlobalMRTForContextLoss,
  reinitializeGlobalMRT,
} from './MRTStateManager'
import { ResourcePool } from './ResourcePool'
import { StateBarrier } from './StateBarrier'
import type {
  CompiledGraph,
  CompileOptions,
  FrameStats,
  PassTiming,
  RenderContext,
  RenderPass,
  RenderResourceConfig,
} from './types'

// =============================================================================
// RenderGraphContext Implementation
// =============================================================================

/**
 * Concrete implementation of RenderContext.
 */
class RenderGraphContext implements RenderContext {
  constructor(
    public renderer: THREE.WebGLRenderer,
    public scene: THREE.Scene,
    public camera: THREE.Camera,
    public delta: number,
    public time: number,
    public size: { width: number; height: number },
    private pool: ResourcePool,
    private pingPongResources: Set<string>,
    private externalRegistry: ExternalResourceRegistry,
    private externalBridge: ExternalBridge,
    public frame: FrozenFrameContext | null,
    private resourceAliases: Map<string, string>
  ) {}

  getResource<T = THREE.WebGLRenderTarget | THREE.Texture>(resourceId: string): T | null {
    return this.pool.get(resourceId) as T | null
  }

  getWriteTarget(resourceId: string): THREE.WebGLRenderTarget | null {
    if (this.pingPongResources.has(resourceId)) {
      return this.pool.getWriteTarget(resourceId)
    }
    return this.pool.get(resourceId)
  }

  getReadTarget(resourceId: string): THREE.WebGLRenderTarget | null {
    // Resolve alias chain to find the actual resource
    const resolvedId = this.resolveAlias(resourceId)

    if (this.pingPongResources.has(resolvedId)) {
      return this.pool.getReadTarget(resolvedId)
    }
    return this.pool.get(resolvedId)
  }

  getReadTexture(resourceId: string, attachment?: number | 'depth'): THREE.Texture | null {
    // Resolve alias chain to find the actual resource
    const resolvedId = this.resolveAlias(resourceId)

    if (this.pingPongResources.has(resolvedId)) {
      return this.pool.getReadTarget(resolvedId)?.texture ?? null
    }
    return this.pool.getTexture(resolvedId, attachment)
  }

  /**
   * Resolve resource alias chain to find actual resource ID.
   *
   * When a pass is disabled with skipPassthrough=true, its output is aliased
   * to its input. This creates a chain: C → B → A where downstream passes
   * reading from C should actually read from A.
   *
   * This method follows the chain to find the final (non-aliased) resource.
   * Uses depth counter for cycle detection (avoids Set allocation per call).
   *
   * @param resourceId - Resource ID to resolve
   * @returns Resolved resource ID (may be same as input if no alias)
   */
  private resolveAlias(resourceId: string): string {
    let current = resourceId
    // OPTIMIZATION: Use depth counter instead of Set to avoid per-call allocation
    // Alias chains are typically 1-2 hops; 16 is more than enough
    let depth = 0
    const maxDepth = 16

    while (this.resourceAliases.has(current)) {
      if (depth >= maxDepth) {
        // Cycle or excessively long chain detected
        console.warn(`RenderGraph: Alias chain too long at '${current}' (possible cycle)`)
        return current
      }
      depth++
      current = this.resourceAliases.get(current)!
    }

    return current
  }

  /**
   * Get a frozen external resource captured at frame start.
   * @param id - Resource identifier
   * @returns The frozen resource value or null
   */
  getExternal<T>(id: string): T | null {
    return this.externalRegistry.get<T>(id)
  }

  /**
   * Queue an export to be applied at frame end.
   * @param pending
   */
  queueExport<T>(pending: PendingExport<T>): void {
    this.externalBridge.queueExport(pending)
  }

  /**
   * Check if an export is registered with the bridge.
   * @param id - Export identifier
   * @returns True if the export is registered
   */
  hasExportRegistered(id: string): boolean {
    return this.externalBridge.hasExport(id)
  }
}

// =============================================================================
// RenderGraph Class
// =============================================================================

/**
 * Declarative render graph for managing complex rendering pipelines.
 *
 * @example
 * ```typescript
 * const graph = new RenderGraph();
 *
 * // Define resources
 * graph.addResource({
 *   id: 'sceneColor',
 *   type: 'renderTarget',
 *   size: { mode: 'screen' },
 *   depthBuffer: true,
 * });
 *
 * graph.addResource({
 *   id: 'bloom',
 *   type: 'renderTarget',
 *   size: { mode: 'fraction', fraction: 0.5 },
 * });
 *
 * // Add passes
 * graph.addPass(new ScenePass({
 *   id: 'scene',
 *   outputs: [{ resourceId: 'sceneColor', access: 'write' }],
 * }));
 *
 * graph.addPass(new BloomPass({
 *   id: 'bloom',
 *   inputs: [{ resourceId: 'sceneColor', access: 'read' }],
 *   outputs: [{ resourceId: 'bloom', access: 'write' }],
 * }));
 *
 * // Compile once (or when graph changes)
 * graph.compile();
 *
 * // Execute each frame
 * graph.execute(renderer, scene, camera, delta, time);
 * ```
 */
export class RenderGraph {
  private compiler = new GraphCompiler()
  private pool = new ResourcePool()
  private compiled: CompiledGraph | null = null
  private isDirty = true

  // External resource registry - captures external state at frame start
  private externalRegistry = new ExternalResourceRegistry()

  // External bridge - manages import/export contract with external systems
  private externalBridge = new ExternalBridge('RenderGraph')

  // State barrier - saves/restores Three.js state around each pass
  private stateBarrier = new StateBarrier()

  // Store getters - used to capture frozen frame context
  private storeGetters: StoreGetters | null = null

  // Frame number counter
  private frameNumber = 0

  // Last captured frame context (for debugging)
  private lastFrameContext: FrozenFrameContext | null = null

  // Statistics
  private timingEnabled = false
  private lastFrameStats: FrameStats | null = null

  // GPU Timing
  private gpuTimer = new GPUTimer()
  private gpuTimingEnabled = false
  private rendererInitialized = false

  // MRT State Management - uses global singleton (see MRTStateManager.ts)

  // Screen size
  private width = 1
  private height = 1

  // Elapsed time tracking
  private elapsedTime = 0

  // Passthrough resources for disabled passes
  // Industry-standard pattern: separate materials per attachment count for optimal GPU usage
  private passthroughMaterials: Map<number, THREE.ShaderMaterial> = new Map()
  private passthroughMesh: THREE.Mesh | null = null
  private passthroughScene: THREE.Scene | null = null
  private passthroughCamera: THREE.OrthographicCamera | null = null
  private passthroughGeometry: THREE.PlaneGeometry | null = null

  // Resource aliasing for disabled passes
  // When a pass is disabled with skipPassthrough=true, its output is aliased
  // to its input so downstream passes read from the correct source without copying.
  // Map: outputResourceId → inputResourceId
  private resourceAliases: Map<string, string> = new Map()

  // Pass state tracking for lazy resource deallocation
  // Tracks how many frames each pass has been disabled for grace period management
  // Map: passId → disabledFrameCount
  private passStateTracking = new Map<string, number>()

  /** Default grace period in frames before resource deallocation (~1s at 60fps) */
  private static readonly DEFAULT_DISABLE_GRACE_PERIOD = 60

  // ==========================================================================
  // Passthrough for disabled passes
  // ==========================================================================

  /** Shared vertex shader for all passthrough materials */
  private static readonly PASSTHROUGH_VERTEX = `
    out vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `

  /**
   * Generate a passthrough fragment shader for the specified attachment count.
   *
   * Industry-standard pattern: generate shaders that match target configuration
   * exactly, avoiding unnecessary output writes and ensuring GL compliance.
   *
   * @param attachmentCount - Number of output attachments (1, 2, 3, or 4)
   * @returns GLSL ES 3.00 fragment shader source
   */
  private static generatePassthroughFragment(attachmentCount: number): string {
    const outputs: string[] = []
    const writes: string[] = []

    // Always output color at location 0
    outputs.push('layout(location = 0) out vec4 gColor;')
    writes.push('gColor = texture(tDiffuse, vUv);')

    // Additional outputs for MRT targets
    if (attachmentCount >= 2) {
      outputs.push('layout(location = 1) out vec4 gNormal;')
      writes.push('gNormal = vec4(0.5, 0.5, 1.0, 0.0);') // Neutral normal
    }
    if (attachmentCount >= 3) {
      outputs.push('layout(location = 2) out vec4 gPosition;')
      writes.push('gPosition = vec4(0.0);') // Zero position
    }
    if (attachmentCount >= 4) {
      outputs.push('layout(location = 3) out vec4 gExtra;')
      writes.push('gExtra = vec4(0.0);')
    }

    return `
      precision highp float;
      in vec2 vUv;
      uniform sampler2D tDiffuse;
      ${outputs.join('\n      ')}
      void main() {
        ${writes.join('\n        ')}
      }
    `
  }

  /**
   * Get or create a passthrough material for the specified attachment count.
   *
   * Materials are cached per attachment count to avoid per-frame allocation.
   * This follows the industry pattern of lazy material creation with caching.
   *
   * @param attachmentCount - Number of target attachments
   * @returns Cached or newly created ShaderMaterial
   */
  private getPassthroughMaterial(attachmentCount: number): THREE.ShaderMaterial {
    // Clamp to supported range
    const count = Math.max(1, Math.min(4, attachmentCount))

    let material = this.passthroughMaterials.get(count)
    if (!material) {
      material = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: {
          tDiffuse: { value: null },
        },
        vertexShader: RenderGraph.PASSTHROUGH_VERTEX,
        fragmentShader: RenderGraph.generatePassthroughFragment(count),
        depthTest: false,
        depthWrite: false,
      })
      this.passthroughMaterials.set(count, material)
    }

    return material
  }

  /**
   * Ensure passthrough scene resources are initialized.
   * Materials are created lazily per attachment count, not here.
   */
  private ensurePassthroughScene(): void {
    if (this.passthroughScene) return

    this.passthroughGeometry = new THREE.PlaneGeometry(2, 2)
    // Start with 1-attachment material, will be swapped as needed
    this.passthroughMesh = new THREE.Mesh(this.passthroughGeometry, this.getPassthroughMaterial(1))
    this.passthroughMesh.frustumCulled = false

    this.passthroughScene = new THREE.Scene()
    this.passthroughScene.add(this.passthroughMesh)

    this.passthroughCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  }

  /**
   * Copy input texture to output for disabled pass.
   *
   * Industry-standard pattern: selects appropriate passthrough shader based on
   * target attachment count. This ensures GL compliance without wasting GPU cycles
   * on unnecessary output writes.
   *
   * @param renderer - WebGL renderer
   * @param inputTexture - Source texture to copy
   * @param outputTarget - Destination render target (null = screen)
   */
  private executePassthrough(
    renderer: THREE.WebGLRenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget | null
  ): void {
    this.ensurePassthroughScene()

    if (!this.passthroughMesh || !this.passthroughScene || !this.passthroughCamera) {
      return
    }

    // Determine attachment count and select appropriate material
    const attachmentCount = outputTarget?.textures?.length ?? 1
    const material = this.getPassthroughMaterial(attachmentCount)

    // Swap material if needed (hot path optimization: only swap when count changes)
    if (this.passthroughMesh.material !== material) {
      this.passthroughMesh.material = material
    }

    material.uniforms['tDiffuse']!.value = inputTexture
    renderer.setRenderTarget(outputTarget)
    // MRTStateManager automatically configures drawBuffers via patched setRenderTarget
    renderer.render(this.passthroughScene, this.passthroughCamera)
  }

  // ==========================================================================
  // Resource Management
  // ==========================================================================

  /**
   * Add a resource to the graph.
   *
   * Resources are GPU objects (render targets, textures) managed by the graph.
   * They are created lazily and automatically resized.
   *
   * @param config - Resource configuration
   * @returns this for chaining
   */
  addResource(config: RenderResourceConfig): this {
    this.compiler.addResource(config)
    this.pool.register(config)
    this.isDirty = true
    return this
  }

  /**
   * Remove a resource from the graph.
   *
   * @param resourceId - Resource identifier
   * @returns this for chaining
   */
  removeResource(resourceId: string): this {
    this.compiler.removeResource(resourceId)
    this.pool.unregister(resourceId)
    this.isDirty = true
    return this
  }

  /**
   * Check if a resource exists.
   *
   * @param resourceId - Resource identifier
   * @returns True if the resource exists
   */
  hasResource(resourceId: string): boolean {
    return this.pool.has(resourceId)
  }

  /**
   * Get a resource's render target directly.
   *
   * Useful for external code that needs to access graph resources.
   *
   * @param resourceId - Resource identifier
   * @returns The render target or null
   */
  getResource(resourceId: string): THREE.WebGLRenderTarget | null {
    return this.pool.get(resourceId)
  }

  /**
   * Get a resource's write target directly.
   *
   * Useful for accessing the current write buffer of a ping-pong resource.
   *
   * @param resourceId - Resource identifier
   * @returns The write target or null
   */
  getWriteTarget(resourceId: string): THREE.WebGLRenderTarget | null {
    return this.pool.getWriteTarget(resourceId)
  }
  /**
   * Get a resource's texture directly.
   *
   * @param resourceId - Resource identifier
   * @param attachment - Attachment index or 'depth'
   * @returns The texture or null
   */
  getTexture(resourceId: string, attachment?: number | 'depth'): THREE.Texture | null {
    return this.pool.getTexture(resourceId, attachment)
  }

  /**
   * Get a resource's read texture (ping-pong aware).
   *
   * For ping-pong resources, returns the texture from the current read buffer
   * (i.e., data written in the previous frame). For non-ping-pong resources,
   * returns the primary texture.
   *
   * Use this for temporal reprojection where you need the previous frame's data.
   *
   * @param resourceId - Resource identifier
   * @param attachment - Optional attachment index for MRT, or 'depth' for depth texture
   * @returns The read texture or null
   */
  getReadTexture(resourceId: string, attachment?: number | 'depth'): THREE.Texture | null {
    // Check if this is a ping-pong resource
    if (this.compiled?.pingPongResources.has(resourceId)) {
      const target = this.pool.getReadTarget(resourceId)
      if (!target) return null

      // Handle attachment types
      if (attachment === 'depth') {
        return target.depthTexture ?? null
      }
      if (typeof attachment === 'number' && target.textures) {
        return target.textures[attachment] ?? null
      }
      return target.texture ?? null
    }

    // Non-ping-pong: delegate to getTexture
    return this.pool.getTexture(resourceId, attachment)
  }

  // ==========================================================================
  // External Resource Management
  // ==========================================================================

  /**
   * Register an external resource to be captured at frame start.
   *
   * External resources are values from outside the render graph (scene.background,
   * store values, etc.) that can be modified by React/external code at any time.
   *
   * By registering them, the graph captures their values ONCE at frame start
   * and passes read frozen values via ctx.getExternal().
   *
   * @example
   * ```typescript
   * graph.registerExternal({
   *   id: 'scene.background',
   *   getter: () => scene.background,
   *   description: 'Scene background for black hole lensing'
   * });
   * ```
   *
   * @param config - External resource configuration
   * @returns this for chaining
   */
  registerExternal<T>(config: ExternalResourceConfig<T>): this {
    this.externalRegistry.register(config)
    return this
  }

  /**
   * Unregister an external resource.
   *
   * @param id - External resource identifier
   * @returns this for chaining
   */
  unregisterExternal(id: string): this {
    this.externalRegistry.unregister(id)
    return this
  }

  /**
   * Check if an external resource is registered.
   *
   * @param id - External resource identifier
   * @returns True if the external resource is registered
   */
  hasExternal(id: string): boolean {
    return this.externalRegistry.has(id)
  }

  /**
   * Get debug information about external resources.
   * @returns Debug information string
   */
  getExternalDebugInfo(): string {
    return this.externalRegistry.getDebugInfo()
  }

  // ==========================================================================
  // External Bridge (Import/Export Contract)
  // ==========================================================================

  /**
   * Register an export configuration.
   *
   * Exports define how internal render graph resources are pushed to external
   * systems (like scene.background, scene.environment) at frame end.
   *
   * @example
   * ```typescript
   * graph.registerExport({
   *   id: 'scene.background',
   *   resourceId: 'skyCubeRT',  // Internal resource (or empty if direct value)
   *   setter: (texture) => { scene.background = texture; },
   *   transform: (rt) => rt.texture  // Optional transform
   * });
   * ```
   *
   * @param config - Export configuration
   * @returns this for chaining
   */
  registerExport<TInternal, TExternal = TInternal>(
    config: ExportConfig<TInternal, TExternal>
  ): this {
    this.externalBridge.registerExport(config)
    return this
  }

  /**
   * Unregister an export.
   *
   * @param id - External resource ID to unregister
   * @returns this for chaining
   */
  unregisterExport(id: string): this {
    this.externalBridge.unregisterExport(id)
    return this
  }

  /**
   * Check if an export is registered.
   *
   * @param id - External resource ID
   * @returns True if the export is registered
   */
  hasExport(id: string): boolean {
    return this.externalBridge.hasExport(id)
  }

  /**
   * Get debug information about the external bridge.
   * @returns Debug information about imports and exports
   */
  getExternalBridgeDebugInfo(): {
    imports: Array<{ id: string; captured: boolean }>
    exports: Array<{ id: string; queued: boolean }>
  } {
    return this.externalBridge.getDebugInfo()
  }

  // ==========================================================================
  // Store Getters (Frame Context)
  // ==========================================================================

  /**
   * Set store getters for capturing frozen frame context.
   *
   * Store getters are functions that retrieve current state from Zustand stores.
   * They are called ONCE at frame start to capture frozen state.
   *
   * @example
   * ```typescript
   * graph.setStoreGetters({
   *   getAnimationState: () => useAnimationStore.getState(),
   *   getGeometryState: () => useGeometryStore.getState(),
   *   getEnvironmentState: () => ({
   *     fog: useEnvironmentStore.getState(),
   *     skybox: useEnvironmentStore.getState(),
   *   }),
   *   getPostProcessingState: () => usePostProcessingStore.getState(),
   *   getPerformanceState: () => usePerformanceStore.getState(),
   *   getBlackHoleState: () => useExtendedObjectStore.getState().blackhole,
   * });
   * ```
   *
   * @param getters - Store getter functions
   * @returns this for chaining
   */
  setStoreGetters(getters: StoreGetters): this {
    this.storeGetters = getters
    return this
  }

  /**
   * Check if store getters are configured.
   * @returns True if store getters are configured
   */
  hasStoreGetters(): boolean {
    return this.storeGetters !== null
  }

  /**
   * Get the last captured frame context (for debugging).
   * @returns The last captured frame context or null
   */
  getLastFrameContext(): FrozenFrameContext | null {
    return this.lastFrameContext
  }

  /**
   * Get current frame number.
   * @returns The current frame number
   */
  getFrameNumber(): number {
    return this.frameNumber
  }

  // ==========================================================================
  // Pass Management
  // ==========================================================================

  /**
   * Add a pass to the graph.
   *
   * @param pass - The render pass
   * @returns this for chaining
   */
  addPass(pass: RenderPass): this {
    this.compiler.addPass(pass)
    this.isDirty = true
    return this
  }

  /**
   * Remove a pass from the graph.
   *
   * @param passId - Pass identifier
   * @returns this for chaining
   */
  removePass(passId: string): this {
    this.compiler.removePass(passId)
    this.isDirty = true
    return this
  }

  // ==========================================================================
  // Compilation
  // ==========================================================================

  /**
   * Compile the graph.
   *
   * This resolves pass dependencies and determines execution order.
   * Call this after modifying passes/resources, or it will be called
   * automatically on first execute().
   *
   * @param options - Compilation options
   * @returns Compilation result with warnings
   * @throws Error if graph contains cycles
   */
  compile(options: CompileOptions = {}): CompiledGraph {
    this.compiled = this.compiler.compile(options)
    this.isDirty = false

    // Enable ping-pong for resources that need it
    for (const resourceId of this.compiled.pingPongResources) {
      this.pool.enablePingPong(resourceId)
    }

    // Clean up state tracking for passes no longer in the graph
    // This prevents memory leaks when passes are removed
    const currentPassIds = new Set(this.compiled.passes.map((p) => p.id))
    for (const passId of this.passStateTracking.keys()) {
      if (!currentPassIds.has(passId)) {
        this.passStateTracking.delete(passId)
      }
    }

    return this.compiled
  }

  /**
   * Check if graph needs recompilation.
   * @returns True if the graph needs recompilation
   */
  needsCompile(): boolean {
    return this.isDirty || this.compiled === null
  }

  /**
   * Mark graph as dirty (needs recompilation).
   */
  invalidate(): void {
    this.isDirty = true
  }

  // ==========================================================================
  // Execution
  // ==========================================================================

  /**
   * Execute the render graph for one frame.
   *
   * @param renderer - Three.js WebGL renderer
   * @param scene - Scene to render
   * @param camera - Camera to use
   * @param delta - Time since last frame in seconds
   */
  execute(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    delta: number
  ): void {
    // Skip execution if size is invalid (can happen on first frames before canvas is sized)
    // This prevents GL_INVALID_FRAMEBUFFER_OPERATION errors from zero-sized render targets
    if (this.width < 1 || this.height < 1) {
      return
    }

    // Initialize GPU timer and MRT manager on first execution (renderer is now available)
    // Note: MRT manager may already be initialized by Scene.tsx's early useLayoutEffect
    if (!this.rendererInitialized) {
      this.gpuTimer.initialize(renderer)
      initializeGlobalMRT(renderer) // Safe to call multiple times
      if (this.gpuTimingEnabled) {
        this.gpuTimer.setEnabled(true)
      }
      this.rendererInitialized = true
    }

    // Auto-compile if needed
    if (this.needsCompile()) {
      this.compile()
    }

    if (!this.compiled) {
      console.warn('RenderGraph: No compiled graph to execute')
      return
    }

    // Update timing
    this.elapsedTime += delta

    // Update pool with current screen size
    this.pool.updateSize(this.width, this.height)

    // CRITICAL: Capture all external resources at frame start
    // This freezes external state (scene.background, store values, etc.)
    // so passes see consistent values throughout the frame.
    this.externalRegistry.captureAll()

    // CRITICAL: Capture frozen frame context from stores
    // This ensures passes see consistent store state throughout the frame.
    let frozenFrameContext: FrozenFrameContext | null = null
    if (this.storeGetters) {
      frozenFrameContext = captureFrameContext(this.frameNumber, scene, camera, this.storeGetters)
      this.lastFrameContext = frozenFrameContext
      // Expose globally for components outside the render graph
      setLastFrameContext(frozenFrameContext)
    }

    // Begin GPU timing frame
    this.gpuTimer.beginFrame()

    // Begin ExternalBridge frame (clears previous frame state)
    this.externalBridge.beginFrame()

    // Clear resource aliases from previous frame
    // Aliases are re-computed each frame based on which passes are enabled
    this.resourceAliases.clear()

    // Create execution context
    const context = new RenderGraphContext(
      renderer,
      scene,
      camera,
      delta,
      this.elapsedTime,
      { width: this.width, height: this.height },
      this.pool,
      this.compiled.pingPongResources,
      this.externalRegistry,
      this.externalBridge,
      frozenFrameContext,
      this.resourceAliases
    )

    // Execute passes
    const passTiming: PassTiming[] = []
    let targetSwitches = 0

    // Track resources written by enabled passes to prevent passthrough overwriting them
    const writtenByEnabledPass = new Set<string>()

    debugLog('execute', '=== Frame', this.frameNumber, 'Start ===')
    debugLog('execute', 'Compiled passes:', this.compiled.passes.map((p) => p.id).join(', '))
    debugLog('execute', 'PingPong resources:', [...this.compiled.pingPongResources].join(', '))

    for (const pass of this.compiled.passes) {
      // Check if pass is enabled (also check debug disable flag)
      // CRITICAL: Pass frozen frame context to enabled() so passes can read store state safely
      const debugDisabled =
        (pass as unknown as { _debugDisabled?: boolean })._debugDisabled ?? false
      const enabled = !debugDisabled && (pass.config.enabled?.(frozenFrameContext) ?? true)

      debugLog('pass', `--- ${pass.id} ---`)
      debugLog('pass', `  enabled: ${enabled}, debugDisabled: ${debugDisabled}`)
      debugLog(
        'pass',
        `  inputs: ${(pass.config.inputs ?? []).map((i) => `${i.resourceId}[${i.attachment ?? 'default'}]`).join(', ')}`
      )
      debugLog(
        'pass',
        `  outputs: ${(pass.config.outputs ?? []).map((o) => `${o.resourceId}`).join(', ')}`
      )
      debugLog('pass', `  skipPassthrough: ${pass.config.skipPassthrough ?? false}`)

      // ========================================================================
      // Lazy Resource Deallocation: Track disabled frames and manage grace period
      // ========================================================================
      if (enabled) {
        // Pass is enabled - reset disabled frame counter
        this.passStateTracking.set(pass.id, 0)
      } else {
        // Pass is disabled - track how long it's been disabled
        const disabledFrameCount = (this.passStateTracking.get(pass.id) ?? 0) + 1
        this.passStateTracking.set(pass.id, disabledFrameCount)

        // Check if grace period has elapsed and pass has releaseInternalResources
        const gracePeriod =
          pass.config.disableGracePeriod ?? RenderGraph.DEFAULT_DISABLE_GRACE_PERIOD
        const keepResources = pass.config.keepResourcesWhenDisabled ?? false

        // Only call releaseInternalResources exactly once when grace period elapses
        if (!keepResources && disabledFrameCount === gracePeriod && pass.releaseInternalResources) {
          pass.releaseInternalResources()
        }
      }
      // ========================================================================

      if (!enabled) {
        // For disabled passes, maintain the resource chain
        const inputs = pass.config.inputs ?? []
        const outputs = pass.config.outputs ?? []

        if (inputs.length >= 1 && outputs.length >= 1) {
          // First input is typically the color/main input
          const inputId = inputs[0]!.resourceId
          const outputId = outputs[0]!.resourceId

          // CRITICAL: Skip if output was already written by an enabled pass
          // This prevents mutually exclusive passes (like scene vs gravityComposite)
          // from overwriting each other's output via passthrough
          if (writtenByEnabledPass.has(outputId)) {
            if (this.timingEnabled) {
              passTiming.push({
                passId: pass.id,
                gpuTimeMs: 0,
                cpuTimeMs: 0,
                skipped: true,
              })
            }
            continue
          }

          // Check if this pass should use aliasing instead of passthrough
          // Aliasing is preferred because:
          // 1. Zero GPU cost (no texture copy)
          // 2. Works correctly for multi-input passes where passthrough loses data
          // 3. Chains automatically: if A→B→C are all aliased, C resolves to A
          const skipPassthrough = pass.config.skipPassthrough ?? false

          if (skipPassthrough) {
            // Register alias: output → input
            // Downstream passes reading 'outputId' will resolve to 'inputId'
            this.resourceAliases.set(outputId, inputId)
            debugLog('alias', `  Aliasing ${outputId} → ${inputId}`)
          } else {
            // Legacy behavior: copy input texture to output target
            const inputTexture = context.getReadTexture(inputId)
            const outputTarget = context.getWriteTarget(outputId)

            debugLog('passthrough', `  Passthrough ${inputId} → ${outputId}`)
            debugLog('passthrough', `    inputTexture: ${inputTexture ? 'exists' : 'NULL'}`)
            debugLog(
              'passthrough',
              `    outputTarget: ${outputTarget ? `${outputTarget.width}x${outputTarget.height}, textures: ${outputTarget.textures?.length ?? 1}` : 'NULL'}`
            )

            if (inputTexture && outputTarget) {
              this.executePassthrough(renderer, inputTexture, outputTarget)
            }
          }
        }

        if (this.timingEnabled) {
          passTiming.push({
            passId: pass.id,
            gpuTimeMs: 0,
            cpuTimeMs: 0,
            skipped: true,
          })
        }
        continue
      }

      // Track outputs written by this enabled pass
      for (const output of pass.config.outputs ?? []) {
        writtenByEnabledPass.add(output.resourceId)
      }

      // Debug: Log resource state for this pass
      if (DEBUG_RENDER_GRAPH()) {
        for (const input of pass.config.inputs ?? []) {
          const texture = context.getReadTexture(input.resourceId, input.attachment)
          const target = context.getReadTarget(input.resourceId)
          debugLog('resource', `  INPUT ${input.resourceId}[${input.attachment ?? 'default'}]:`)
          debugLog('resource', `    texture: ${texture ? 'exists' : 'NULL'}`)
          debugLog(
            'resource',
            `    target: ${target ? `${target.width}x${target.height}, textures: ${target.textures?.length ?? 1}` : 'NULL'}`
          )
          if (target?.textures && target.textures.length > 1) {
            debugLog(
              'resource',
              `    MRT textures: ${target.textures.map((t, i) => `[${i}]:${t ? 'exists' : 'NULL'}`).join(', ')}`
            )
          }
        }
        for (const output of pass.config.outputs ?? []) {
          const target = context.getWriteTarget(output.resourceId)
          debugLog('resource', `  OUTPUT ${output.resourceId}:`)
          debugLog(
            'resource',
            `    target: ${target ? `${target.width}x${target.height}, textures: ${target.textures?.length ?? 1}` : 'NULL'}`
          )
          if (target?.textures && target.textures.length > 1) {
            debugLog(
              'resource',
              `    MRT textures: ${target.textures.map((t, i) => `[${i}]:${t ? 'exists' : 'NULL'}`).join(', ')}`
            )
          }
        }
      }

      // CRITICAL: Capture Three.js state before pass execution
      // This prevents cross-pass state leakage (render targets, clear flags, etc.)
      this.stateBarrier.capture(renderer, scene, camera)

      try {
        // Execute pass with timing if enabled
        if (this.timingEnabled) {
          const startTime = performance.now()

          // Begin GPU query for this pass
          this.gpuTimer.beginQuery(pass.id)

          pass.execute(context)

          // End GPU query
          this.gpuTimer.endQuery()

          const endTime = performance.now()

          // Get GPU time from previous frames (queries are async)
          const gpuTimeMs = this.gpuTimer.getPassTime(pass.id)

          passTiming.push({
            passId: pass.id,
            gpuTimeMs,
            cpuTimeMs: endTime - startTime,
            skipped: false,
          })
        } else {
          pass.execute(context)
        }
      } finally {
        // CRITICAL: Restore Three.js state after pass execution
        // This ensures subsequent passes see expected initial state
        this.stateBarrier.restore(renderer, scene, camera)
      }

      targetSwitches++
    }

    // End GPU timing frame
    this.gpuTimer.endFrame()

    // CRITICAL: Execute all queued exports AFTER passes complete
    // This ensures scene.background, scene.environment etc. are set consistently
    // after the render graph has finished all internal rendering.
    this.externalBridge.executeExports()

    // Call postFrame on passes for temporal resource advancement
    for (const pass of this.compiled.passes) {
      if (pass.postFrame) {
        pass.postFrame()
      }
    }

    // Swap ping-pong buffers
    for (const resourceId of this.compiled.pingPongResources) {
      this.pool.swap(resourceId)
    }

    // TBDR optimization: invalidate non-persistent framebuffers
    // On mobile GPUs (Apple, Mali, Adreno), this allows skipping tile store operations
    this.pool.invalidateFramebuffers(renderer, this.compiled.pingPongResources)

    // End frame
    this.pool.endFrame()

    // Advance external resource registry frame
    // This resets captured state for next frame
    this.externalRegistry.advanceFrame()

    // Increment frame number
    this.frameNumber++

    // Store stats
    if (this.timingEnabled) {
      this.lastFrameStats = {
        totalTimeMs: passTiming.reduce((sum, p) => sum + p.cpuTimeMs, 0),
        passTiming,
        targetSwitches,
        vramUsage: this.pool.getVRAMUsage(),
      }
    }
  }

  // ==========================================================================
  // Screen Size
  // ==========================================================================

  /**
   * Update screen dimensions.
   *
   * Call this when the viewport size changes.
   *
   * @param width - Screen width in pixels
   * @param height - Screen height in pixels
   * @param resolutionScale - Resolution scale factor (0.5 = half res, 1.0 = full res)
   */
  setSize(width: number, height: number, resolutionScale = 1.0): void {
    this.width = Math.max(1, Math.floor(width * resolutionScale))
    this.height = Math.max(1, Math.floor(height * resolutionScale))
    // CRITICAL: Force resize on next ensureAllocated call
    // This ensures the pool actually resizes targets on the next frame
    this.pool.updateSize(this.width, this.height)
    // Force a recompile to ensure all passes use new dimensions
    this.isDirty = true
  }

  /**
   * Get current screen dimensions.
   * @returns Object containing width and height in pixels
   */
  getSize(): { width: number; height: number } {
    return { width: this.width, height: this.height }
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  /**
   * Enable or disable timing collection (CPU timing).
   *
   * @param enabled - Whether to collect timing data
   */
  enableTiming(enabled: boolean): void {
    this.timingEnabled = enabled
  }

  /**
   * Enable or disable GPU timing queries.
   *
   * Uses EXT_disjoint_timer_query_webgl2 extension when available.
   * GPU timing is inherently asynchronous - results are typically
   * available 1-2 frames after the pass executes.
   *
   * @param enabled - Whether to collect GPU timing data
   */
  enableTimingQueries(enabled: boolean): void {
    this.gpuTimingEnabled = enabled
    if (this.rendererInitialized) {
      this.gpuTimer.setEnabled(enabled)
    }
    // Also enable CPU timing when GPU timing is enabled
    if (enabled) {
      this.timingEnabled = true
    }
  }

  /**
   * Check if GPU timing queries are available.
   *
   * @returns True if EXT_disjoint_timer_query_webgl2 is supported
   */
  isGPUTimingAvailable(): boolean {
    return this.gpuTimer.isAvailable()
  }

  /**
   * Get per-pass timing information.
   *
   * Returns timing data from the most recent frame where results
   * are available. GPU timings are asynchronous and may lag by 1-2 frames.
   * @returns Array of pass timing data
   */
  getPassTimings(): PassTiming[] {
    return this.lastFrameStats?.passTiming ?? []
  }

  /**
   * Get last frame's statistics.
   *
   * @returns Frame statistics or null if timing is disabled
   */
  getFrameStats(): FrameStats | null {
    return this.lastFrameStats
  }

  /**
   * Get estimated VRAM usage.
   * @returns VRAM usage in bytes
   */
  getVRAMUsage(): number {
    return this.pool.getVRAMUsage()
  }

  /**
   * Get list of registered resource IDs.
   * @returns Array of registered resource IDs
   */
  getResourceIds(): string[] {
    return this.pool.getResourceIds()
  }

  /**
   * Get dimensions of all allocated resources.
   * Returns a map of resource IDs to their current dimensions.
   * Useful for performance monitoring buffer stats display.
   * @returns Map of resource IDs to dimensions
   */
  getResourceDimensions(): Map<string, { width: number; height: number }> {
    return this.pool.getResourceDimensions()
  }

  // ==========================================================================
  // Lazy Resource Deallocation
  // ==========================================================================

  /**
   * Get resource deallocation statistics.
   *
   * Useful for monitoring memory management and debugging.
   *
   * @returns Stats about pass states and pending deallocations
   */
  getResourceDeallocationStats(): {
    enabledPasses: number
    disabledPasses: number
    pendingDeallocations: number
  } {
    let enabled = 0
    let disabled = 0
    let pending = 0

    for (const [passId, disabledFrameCount] of this.passStateTracking) {
      const pass = this.compiled?.passes.find((p) => p.id === passId)
      if (!pass) continue

      if (disabledFrameCount === 0) {
        enabled++
      } else {
        disabled++
        const gracePeriod =
          pass.config.disableGracePeriod ?? RenderGraph.DEFAULT_DISABLE_GRACE_PERIOD
        const keepResources = pass.config.keepResourcesWhenDisabled ?? false
        if (!keepResources && disabledFrameCount < gracePeriod && pass.releaseInternalResources) {
          pending++
        }
      }
    }

    return { enabledPasses: enabled, disabledPasses: disabled, pendingDeallocations: pending }
  }

  /**
   * Force immediate resource release for a disabled pass.
   *
   * Useful for memory-critical situations where waiting for the grace period
   * is not acceptable.
   *
   * @param passId - Pass identifier
   * @returns True if resources were released, false if pass not found or has no releaseInternalResources
   */
  forceReleasePassResources(passId: string): boolean {
    const pass = this.compiled?.passes.find((p) => p.id === passId)
    if (pass?.releaseInternalResources) {
      pass.releaseInternalResources()
      return true
    }
    return false
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Initialize the MRT state manager early.
   *
   * CRITICAL: Call this in useLayoutEffect BEFORE any useFrame callbacks run.
   * This ensures the renderer's setRenderTarget is patched before ANY rendering
   * happens, including CubeCamera captures and other pre-graph rendering.
   *
   * Without early initialization, rendering that happens before execute() will
   * not have proper drawBuffers management, leading to GL_INVALID_OPERATION errors.
   *
   * @param renderer - Three.js WebGL renderer to patch
   */
  initializeRenderer(renderer: THREE.WebGLRenderer): void {
    if (!this.rendererInitialized) {
      this.gpuTimer.initialize(renderer)
      initializeGlobalMRT(renderer) // Safe to call multiple times
      if (this.gpuTimingEnabled) {
        this.gpuTimer.setEnabled(true)
      }
      this.rendererInitialized = true
    }
  }

  /**
   * Dispose all resources and passes.
   */
  dispose(): void {
    // Dispose passes
    if (this.compiled) {
      for (const pass of this.compiled.passes) {
        pass.dispose?.()
      }
    }

    // Dispose GPU timer
    this.gpuTimer.dispose()

    // Dispose external resource registry
    this.externalRegistry.dispose()

    // Dispose external bridge
    this.externalBridge.dispose()

    // Note: Global MRT manager is NOT disposed here - it's a singleton shared across
    // RenderGraph instances and persists for the app lifetime. It only gets cleaned
    // up on context loss/restore or full app shutdown.

    // Dispose resource pool
    this.pool.dispose()

    // Dispose passthrough resources
    for (const material of this.passthroughMaterials.values()) {
      material.dispose()
    }
    this.passthroughMaterials.clear()

    if (this.passthroughGeometry) {
      this.passthroughGeometry.dispose()
      this.passthroughGeometry = null
    }
    if (this.passthroughMesh) {
      this.passthroughMesh = null
    }
    this.passthroughScene = null
    this.passthroughCamera = null

    // Clear compiler
    this.compiler.clear()

    this.compiled = null
    this.isDirty = true
    this.rendererInitialized = false
  }

  /**
   * Handle WebGL context loss.
   */
  invalidateForContextLoss(): void {
    this.pool.invalidateForContextLoss()
    this.gpuTimer.invalidateForContextLoss()
    this.externalRegistry.invalidateCaptures()
    invalidateGlobalMRTForContextLoss()
    this.rendererInitialized = false
  }

  /**
   * Reinitialize after context restoration.
   *
   * @param renderer - Three.js WebGL renderer (required to reinitialize GPU timer and MRT manager)
   */
  reinitialize(renderer?: THREE.WebGLRenderer): void {
    this.pool.reinitialize()
    if (renderer) {
      this.gpuTimer.reinitialize(renderer)
      reinitializeGlobalMRT(renderer)
      this.rendererInitialized = true
    }
  }

  // ==========================================================================
  // Debugging
  // ==========================================================================

  /**
   * Get debug information about the graph.
   * @returns Debug information string
   */
  getDebugInfo(): string {
    return this.compiler.getDebugInfo()
  }

  /**
   * Get current resource aliases for debugging.
   *
   * Shows which output resources are aliased to which input resources
   * when passes are disabled with skipPassthrough=true.
   *
   * @returns Map of outputId → resolvedInputId
   */
  getResourceAliases(): Map<string, string> {
    // Return resolved aliases (follow chains to final source)
    const resolved = new Map<string, string>()
    for (const [outputId] of this.resourceAliases) {
      let current = outputId
      const visited = new Set<string>()
      while (this.resourceAliases.has(current) && !visited.has(current)) {
        visited.add(current)
        current = this.resourceAliases.get(current)!
      }
      resolved.set(outputId, current)
    }
    return resolved
  }

  /**
   * Get the compiled pass order.
   * @returns Array of pass IDs in execution order
   */
  getPassOrder(): string[] {
    return this.compiled?.passes.map((p) => p.id) ?? []
  }

  /**
   * Get all compiled passes for debugging.
   * @internal Debug only - not for production use
   * @returns Array of compiled render passes
   */
  getPasses(): RenderPass[] {
    return this.compiled?.passes ?? []
  }

  /**
   * Force disable a pass by ID (for debugging).
   * @param passId - Pass identifier
   * @returns True if pass was found and disabled
   * @internal Debug only - not for production use
   */
  debugDisablePass(passId: string): boolean {
    const pass = this.compiled?.passes.find((p) => p.id === passId)
    if (pass) {
      ;(pass as unknown as { _debugDisabled?: boolean })._debugDisabled = true
      return true
    }
    return false
  }

  /**
   * Re-enable a previously disabled pass (for debugging).
   * @param passId - Pass identifier
   * @returns True if pass was found and enabled
   * @internal Debug only - not for production use
   */
  debugEnablePass(passId: string): boolean {
    const pass = this.compiled?.passes.find((p) => p.id === passId)
    if (pass) {
      ;(pass as unknown as { _debugDisabled?: boolean })._debugDisabled = false
      return true
    }
    return false
  }
}
