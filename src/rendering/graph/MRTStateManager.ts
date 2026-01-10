/**
 * MRT State Manager
 *
 * Centralized management of WebGL drawBuffers state for Multiple Render Targets.
 * This manager patches Three.js renderer.setRenderTarget to automatically configure
 * drawBuffers whenever a render target is bound.
 *
 * ## Problem Statement
 * WebGL2 requires strict matching between:
 * 1. Bound render target attachments (via glBindFramebuffer)
 * 2. drawBuffers configuration (via gl.drawBuffers([...]))
 * 3. Fragment shader outputs (via layout(location = N) out vec4)
 *
 * When these don't match, WebGL throws:
 * `GL_INVALID_OPERATION: glDrawElements: Active draw buffers with missing fragment shader outputs`
 *
 * ## Solution
 * This manager patches renderer.setRenderTarget() to automatically configure
 * gl.drawBuffers() based on the target's attachment count. This catches ALL
 * render target changes, including Three.js internal rendering.
 *
 * ## Architecture (following Unreal/Unity/Frostbite patterns)
 * - The render graph OWNS render target state management
 * - Passes don't manually configure GL state
 * - All setRenderTarget calls go through patched method
 * - Automatic, not opt-in
 *
 * @module rendering/graph/MRTStateManager
 */

import * as THREE from 'three'

/**
 * Pre-built drawBuffers arrays to avoid allocation in hot path.
 * Initialized lazily on first use with actual GL constants.
 *
 * DRAW_BUFFERS_BACK is for the default framebuffer (screen) - uses gl.BACK
 * DRAW_BUFFERS_1-4 are for FBOs with 1-4 color attachments - use COLOR_ATTACHMENTn
 */
const DRAW_BUFFERS_BACK: GLenum[] = []
const DRAW_BUFFERS_1: GLenum[] = []
const DRAW_BUFFERS_2: GLenum[] = []
const DRAW_BUFFERS_3: GLenum[] = []
const DRAW_BUFFERS_4: GLenum[] = []

/**
 * Type for the original setRenderTarget method.
 */
type SetRenderTargetFn = (
  renderTarget: THREE.WebGLRenderTarget | null,
  activeCubeFace?: number,
  activeMipmapLevel?: number
) => void

/**
 * Type for the original render method.
 */
type RenderFn = (scene: THREE.Scene, camera: THREE.Camera) => void

/**
 * MRT State Manager
 *
 * Manages WebGL drawBuffers state by patching renderer.setRenderTarget.
 * Creates a single point of control for MRT configuration.
 *
 * ## Key Design Decisions
 *
 * 1. **Track actual target, not just count**: Two different targets with the same
 *    attachment count need separate drawBuffers calls because Three.js binds
 *    different framebuffers.
 *
 * 2. **Wrap renderer.render()**: Three.js internally renders shadows before scene
 *    objects. Shadow maps change the render target (and our drawBuffers). After
 *    shadow rendering, Three.js restores the original target BUT may not trigger
 *    our patch correctly due to internal state optimization.
 *
 * 3. **Force sync after internal operations**: Provide forceSync() for cases where
 *    external code needs to ensure drawBuffers matches the current target.
 */
export class MRTStateManager {
  /** WebGL2 rendering context */
  private gl: WebGL2RenderingContext | null = null

  /** The patched renderer */
  private renderer: THREE.WebGLRenderer | null = null

  /** Original setRenderTarget method (for restoration) */
  private originalSetRenderTarget: SetRenderTargetFn | null = null

  /** Original render method (for restoration) */
  private originalRender: RenderFn | null = null

  /** Current configured attachment count (-1 = uninitialized) */
  private currentAttachmentCount = -1

  /** Current render target UUID (tracked to detect target changes, not just count changes) */
  private currentTargetUuid: string | null = null

  /** Whether the manager has been initialized */
  private initialized = false

  /** Whether drawBuffers arrays have been populated with GL constants */
  private arraysInitialized = false

  /** Render depth counter to detect nested render calls */
  private renderDepth = 0

  /**
   * Initialize the manager and patch the renderer.
   *
   * Must be called once with a valid renderer before any rendering.
   * Safe to call multiple times - will only initialize once.
   *
   * @param renderer - Three.js WebGL renderer to patch
   */
  initialize(renderer: THREE.WebGLRenderer): void {
    if (this.initialized && this.renderer === renderer) {
      return // Already initialized with this renderer
    }

    // Unpatch previous renderer if different
    if (this.renderer && this.renderer !== renderer) {
      this.unpatchRenderer()
    }

    this.renderer = renderer
    this.gl = renderer.getContext() as WebGL2RenderingContext

    // Explicitly enable EXT_float_blend for blending on float/half-float render targets.
    // Without this, WebGL throws a warning when blending is used with HalfFloatType targets
    // (e.g., Schrödinger temporal accumulation): "Using format enabled by implicitly enabled
    // extension: EXT_float_blend. For maximal portability enable it explicitly."
    this.gl.getExtension('EXT_float_blend')

    this.initializeDrawBufferArrays()
    this.patchRenderer()

    this.initialized = true
    this.currentAttachmentCount = -1 // Force first sync
  }

  /**
   * Initialize the pre-built drawBuffers arrays with GL constants.
   * Only done once per GL context.
   */
  private initializeDrawBufferArrays(): void {
    if (this.arraysInitialized || !this.gl) return

    const gl = this.gl

    // For default framebuffer (screen) - must use gl.BACK, not COLOR_ATTACHMENT0
    DRAW_BUFFERS_BACK[0] = gl.BACK

    // For FBOs with color attachments
    DRAW_BUFFERS_1[0] = gl.COLOR_ATTACHMENT0

    DRAW_BUFFERS_2[0] = gl.COLOR_ATTACHMENT0
    DRAW_BUFFERS_2[1] = gl.COLOR_ATTACHMENT1

    DRAW_BUFFERS_3[0] = gl.COLOR_ATTACHMENT0
    DRAW_BUFFERS_3[1] = gl.COLOR_ATTACHMENT1
    DRAW_BUFFERS_3[2] = gl.COLOR_ATTACHMENT2

    DRAW_BUFFERS_4[0] = gl.COLOR_ATTACHMENT0
    DRAW_BUFFERS_4[1] = gl.COLOR_ATTACHMENT1
    DRAW_BUFFERS_4[2] = gl.COLOR_ATTACHMENT2
    DRAW_BUFFERS_4[3] = gl.COLOR_ATTACHMENT3

    this.arraysInitialized = true
  }

  /**
   * Patch renderer.setRenderTarget and renderer.render to manage MRT state.
   */
  private patchRenderer(): void {
    if (!this.renderer) return

    // Store original methods
    this.originalSetRenderTarget = this.renderer.setRenderTarget.bind(this.renderer)
    this.originalRender = this.renderer.render.bind(this.renderer)

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this
    const originalSetRenderTarget = this.originalSetRenderTarget
    const originalRender = this.originalRender

    // Patch setRenderTarget
    this.renderer.setRenderTarget = function (
      renderTarget: THREE.WebGLRenderTarget | null,
      activeCubeFace?: number,
      activeMipmapLevel?: number
    ): void {
      // Call original Three.js method first (binds framebuffer)
      originalSetRenderTarget(renderTarget, activeCubeFace, activeMipmapLevel)

      // Sync drawBuffers for the new target
      self.syncDrawBuffers(renderTarget)
    }

    // Patch render() to detect if Three.js internally changed targets
    // This handles shadow map rendering which changes targets internally.
    //
    // OPTIMIZATION: Instead of forcing a full resync after every render (which
    // caused 70% redundant gl.drawBuffers calls), we now only resync if the
    // target actually changed during render. This follows the principle of
    // "don't pay for what you don't use".
    this.renderer.render = function (scene: THREE.Scene, camera: THREE.Camera): void {
      self.renderDepth++

      // Capture target BEFORE render to detect if Three.js changed it internally
      const targetBeforeRender = self.renderDepth === 1 ? self.currentTargetUuid : null

      // Call original render (may internally change targets for shadows, etc.)
      originalRender(scene, camera)

      // On outermost render completion, check if target diverged
      if (self.renderDepth === 1) {
        // Get the ACTUAL current target from Three.js state
        const actualTarget = (self.renderer as THREE.WebGLRenderer).getRenderTarget()
        const actualUuid = (actualTarget as unknown as { uuid?: string })?.uuid ?? null

        // Only resync if target actually changed during render
        // (e.g., shadow map rendering that didn't restore correctly)
        if (actualUuid !== targetBeforeRender) {
          self.currentAttachmentCount = -1
          self.currentTargetUuid = null
          self.syncDrawBuffers(actualTarget)
        }
      }

      self.renderDepth--
    }
  }

  /**
   * Restore the original setRenderTarget and render methods.
   */
  private unpatchRenderer(): void {
    if (this.renderer) {
      if (this.originalSetRenderTarget) {
        this.renderer.setRenderTarget = this.originalSetRenderTarget
        this.originalSetRenderTarget = null
      }
      if (this.originalRender) {
        this.renderer.render = this.originalRender
        this.originalRender = null
      }
    }
  }

  /**
   * Synchronize gl.drawBuffers with the current render target.
   *
   * Called automatically after every setRenderTarget via the patch.
   * Issues GL call if:
   * 1. Attachment count changed, OR
   * 2. Target reference changed (different FBO, even if same count)
   *
   * We use count = 0 to represent "default framebuffer" which uses gl.BACK.
   * This is CRITICAL: after rendering to an MRT (count=3), we MUST reset
   * drawBuffers when going back to screen, otherwise the GL state still
   * expects 3 outputs and single-output shaders fail with GL_INVALID_OPERATION.
   *
   * @param target - The render target that was just bound
   */
  private syncDrawBuffers(target: THREE.WebGLRenderTarget | null): void {
    if (!this.gl) return

    // For default framebuffer (screen), use count = 0 as marker
    // For FBOs, get actual attachment count
    const count = target ? this.getAttachmentCount(target) : 0

    // Check if target changed (not just count) - use UUID to detect different targets

    const targetUuid = (target as unknown as { uuid?: string })?.uuid ?? null
    const targetChanged = targetUuid !== this.currentTargetUuid

    // Skip ONLY if BOTH count AND target are unchanged
    // This ensures we always call drawBuffers when switching between different FBOs,
    // even if they have the same attachment count
    if (count === this.currentAttachmentCount && !targetChanged) {
      return
    }

    // Configure drawBuffers
    this.setDrawBuffers(count)
    this.currentAttachmentCount = count
    this.currentTargetUuid = targetUuid
  }

  /**
   * Get the number of color attachments for a render target.
   *
   * @param target - Render target (null = screen/default framebuffer)
   * @returns Number of color attachments
   */
  private getAttachmentCount(target: THREE.WebGLRenderTarget | null): number {
    // Screen (default framebuffer) has 1 attachment
    if (!target) {
      return 1
    }

    // Check MRT textures array
    if (target.textures && Array.isArray(target.textures) && target.textures.length > 1) {
      return target.textures.length
    }

    // Single attachment target
    return 1
  }

  /**
   * Set gl.drawBuffers for the specified attachment count.
   *
   * Uses pre-built arrays to avoid allocation.
   *
   * @param count - Number of attachments (0 = default framebuffer/screen)
   */
  private setDrawBuffers(count: number): void {
    if (!this.gl) return

    switch (count) {
      case 0:
        // Default framebuffer (screen) - must use gl.BACK
        this.gl.drawBuffers(DRAW_BUFFERS_BACK)
        break
      case 1:
        this.gl.drawBuffers(DRAW_BUFFERS_1)
        break
      case 2:
        this.gl.drawBuffers(DRAW_BUFFERS_2)
        break
      case 3:
        this.gl.drawBuffers(DRAW_BUFFERS_3)
        break
      case 4:
        this.gl.drawBuffers(DRAW_BUFFERS_4)
        break
      default:
        // Dynamically build array for unusual counts (> 4)
        if (count > 4) {
          const buffers: GLenum[] = []
          for (let i = 0; i < count; i++) {
            buffers.push(this.gl.COLOR_ATTACHMENT0 + i)
          }
          this.gl.drawBuffers(buffers)
        }
        break
    }
  }

  /**
   * Handle WebGL context loss.
   *
   * Resets internal state. The manager will reinitialize on next use.
   */
  invalidateForContextLoss(): void {
    this.gl = null
    this.currentAttachmentCount = -1
    this.currentTargetUuid = null
    this.arraysInitialized = false
    this.renderDepth = 0
    // Don't unpatch - renderer reference may still be valid after restore
  }

  /**
   * Reinitialize after context restore.
   *
   * @param renderer - The renderer (may be same instance with new context)
   */
  reinitialize(renderer: THREE.WebGLRenderer): void {
    this.initialized = false
    this.initialize(renderer)
  }

  /**
   * Check if the manager is initialized.
   * @returns True if initialized
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Force a drawBuffers sync on next setRenderTarget.
   *
   * Useful after operations that may have changed GL state externally.
   */
  invalidateState(): void {
    this.currentAttachmentCount = -1
    this.currentTargetUuid = null
  }

  /**
   * Force immediate drawBuffers sync for the current render target.
   *
   * Call this after any operation that might have changed drawBuffers externally,
   * such as:
   * - After Three.js internal operations (renderer.compile, etc.)
   * - After direct WebGL calls
   * - After library code that manages its own GL state
   *
   * This queries Three.js for the current target and forces a drawBuffers call.
   */
  forceSync(): void {
    if (!this.renderer || !this.gl) return

    // Get the actual current target from Three.js
    const target = this.renderer.getRenderTarget()

    // Force resync by clearing tracked state
    this.currentAttachmentCount = -1
    this.currentTargetUuid = null

    // Now sync will always execute
    this.syncDrawBuffers(target)
  }

  /**
   * Get current render depth (for debugging).
   * Non-zero means we're inside a renderer.render() call.
   * @returns Current render depth
   */
  getRenderDepth(): number {
    return this.renderDepth
  }

  /**
   * Dispose the manager and restore original renderer methods.
   */
  dispose(): void {
    this.unpatchRenderer()
    this.gl = null
    this.renderer = null
    this.currentAttachmentCount = -1
    this.currentTargetUuid = null
    this.initialized = false
    this.renderDepth = 0
  }
}

/**
 * Check if a render target is an MRT (Multiple Render Target).
 *
 * Utility function for passes that need to detect MRT targets.
 *
 * @param target - Render target to check
 * @returns True if target has multiple color attachments
 */
export function isMRTTarget(target: THREE.WebGLRenderTarget | null): boolean {
  if (!target) return false
  return !!(target.textures && Array.isArray(target.textures) && target.textures.length > 1)
}

/**
 * Get the attachment count for a render target.
 *
 * Utility function for external code that needs attachment count.
 *
 * @param target - Render target (null = screen)
 * @returns Number of color attachments
 */
export function getAttachmentCount(target: THREE.WebGLRenderTarget | null): number {
  if (!target) return 1
  if (target.textures && Array.isArray(target.textures) && target.textures.length > 1) {
    return target.textures.length
  }
  return 1
}

// =============================================================================
// Global MRT Initialization
// =============================================================================

/**
 * Global MRT state manager instance for early initialization.
 *
 * CRITICAL: This singleton ensures MRT state is managed consistently across
 * the entire application, regardless of which component initializes first.
 *
 * The problem: When CubeCamera.update() is called in a useLayoutEffect BEFORE
 * the RenderGraph's useLayoutEffect, the renderer is not yet patched, causing
 * GL_INVALID_OPERATION errors.
 *
 * The solution: A single global manager that gets initialized ONCE at the
 * earliest possible point (Scene.tsx's parent-level useLayoutEffect).
 */
const globalMRTManager = new MRTStateManager()

/**
 * Initialize global MRT state management.
 *
 * Call this from a parent component's useLayoutEffect BEFORE any child
 * components that may render to MRT targets.
 *
 * Safe to call multiple times - only initializes once per renderer.
 *
 * @param renderer - Three.js WebGL renderer to patch
 */
export function initializeGlobalMRT(renderer: THREE.WebGLRenderer): void {
  globalMRTManager.initialize(renderer)
}

/**
 * Get the global MRT manager instance.
 *
 * Useful for RenderGraph to avoid creating its own instance.
 *
 * @returns The global MRTStateManager instance
 */
export function getGlobalMRTManager(): MRTStateManager {
  return globalMRTManager
}

/**
 * Handle WebGL context loss for global MRT manager.
 */
export function invalidateGlobalMRTForContextLoss(): void {
  globalMRTManager.invalidateForContextLoss()
}

/**
 * Reinitialize global MRT manager after context restore.
 *
 * @param renderer - The renderer (may be same instance with new context)
 */
export function reinitializeGlobalMRT(renderer: THREE.WebGLRenderer): void {
  globalMRTManager.reinitialize(renderer)
}
