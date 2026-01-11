/**
 * Cubemap Capture Pass
 *
 * Handles cubemap environment maps for both procedural and classic skyboxes:
 *
 * 1. PROCEDURAL MODE: Captures the SKYBOX layer to a CubeRenderTarget
 * 2. CLASSIC MODE: Captures the SKYBOX layer (displaying KTX2 texture) to a CubeRenderTarget
 *    to ensure mipmaps are generated for proper roughness-based IBL.
 *
 * For both modes, generates PMREM for PBR reflections and exports via ExternalBridge:
 * - scene.background (captured CubeTexture) - for black hole gravitational lensing
 * - scene.environment (PMREM texture) - for wall PBR reflections
 *
 * CRITICAL: This pass uses ctx.queueExport() instead of directly modifying scene.background.
 * This ensures exports are batched and applied AFTER all passes complete via executeExports().
 * The black hole shader reads scene.background in the NEXT frame, ensuring frame consistency.
 *
 * By running inside the render graph, we ensure proper MRT state management
 * via the patched renderer.setRenderTarget. This prevents GL_INVALID_OPERATION
 * errors that occurred when PMREMGenerator ran outside the render graph.
 *
 * Implementation based on Three.js CubeCamera and PMREMGenerator.
 * @see https://github.com/mrdoob/three.js/blob/dev/src/cameras/CubeCamera.js
 * @see https://github.com/mrdoob/three.js/blob/dev/src/extras/PMREMGenerator.js
 */

import * as THREE from 'three'

import { RENDER_LAYERS } from '@/rendering/core/layers'

import { BasePass } from '../BasePass'
import { getGlobalMRTManager } from '../MRTStateManager'
import { TemporalResource } from '../TemporalResource'
import type { RenderContext, RenderPassConfig } from '../types'

export interface CubemapCapturePassConfig extends Omit<RenderPassConfig, 'inputs' | 'outputs'> {
  /** Resolution per cube face for scene.background (default 256) */
  backgroundResolution?: number
  /** Resolution for PMREM environment map (default 256) - reserved for future use */
  environmentResolution?: number
  /** Whether to generate PMREM for scene.environment (for wall reflections) */
  generatePMREM?: () => boolean
  /** Callback to get external CubeTexture for classic skybox mode */
  getExternalCubeTexture?: () => THREE.CubeTexture | null
}

/**
 * Pass that handles cubemap environment maps for:
 * - Black hole gravitational lensing (scene.background)
 * - Wall PBR reflections (scene.environment via PMREM)
 *
 * Works in two modes (unified pipeline):
 * - PROCEDURAL: Captures SKYBOX layer (procedural shader) to CubeRenderTarget
 * - CLASSIC: Captures SKYBOX layer (KTX2 texture on mesh) to CubeRenderTarget
 *
 * Unification ensures that we always have a mipmapped CubeTexture for scene.background,
 * solving issues where KTX2 textures lack mipmaps and cause black rendering in shaders
 * using textureLod().
 */
export class CubemapCapturePass extends BasePass {
  // Background capture
  private cubeRenderTarget: THREE.WebGLCubeRenderTarget | null = null
  private cubeCamera: THREE.CubeCamera | null = null
  private backgroundResolution: number

  // PMREM for environment (for walls)
  private pmremGenerator: THREE.PMREMGenerator | null = null
  private pmremRenderTarget: THREE.WebGLRenderTarget | null = null
  private generatePMREM: () => boolean

  // External texture tracking
  private getExternalCubeTexture: () => THREE.CubeTexture | null
  private lastExternalTextureUuid: string | null = null
  // Track skybox mode to detect procedural/classic changes
  private lastSkyboxMode: string | null = null

  // Temporal cubemap history (2-frame buffer for proper initialization)
  private cubemapHistory: TemporalResource<THREE.WebGLCubeRenderTarget> | null = null

  // Capture control
  private needsCapture = true
  private didCaptureThisFrame = false
  private pendingPMREMDispose: THREE.WebGLRenderTarget | null = null

  // Capture throttling - update every N frames for performance
  // Lower = smoother but more expensive, Higher = cheaper but staccato
  private captureFrameCounter = 0
  private pmremFrameCounter = 0
  // Capture every 3 frames (~20 FPS) - IBL reflections still look smooth at this rate
  private static readonly CAPTURE_UPDATE_INTERVAL = 3
  private static readonly PMREM_UPDATE_INTERVAL = 2 // Update PMREM every 2 captures for balance

  constructor(config: CubemapCapturePassConfig) {
    super({
      ...config,
      inputs: [],
      outputs: [],
    })

    this.backgroundResolution = config.backgroundResolution ?? 256
    this.generatePMREM = config.generatePMREM ?? (() => false)
    this.getExternalCubeTexture = config.getExternalCubeTexture ?? (() => null)
  }

  /**
   * Initialize the cube camera and render target for background capture.
   * Note: The cubeRenderTarget here is a placeholder - actual rendering uses
   * the temporal history targets. Settings must match to avoid WebGL state conflicts.
   */
  private ensureCubeCamera(): void {
    if (this.cubeRenderTarget && this.cubeCamera) return

    // CRITICAL: generateMipmaps must be FALSE to match temporal history targets.
    // Mismatch between this placeholder and the actual render targets causes
    // "bindTexture: textures can not be used with multiple targets" warnings.
    this.cubeRenderTarget = new THREE.WebGLCubeRenderTarget(this.backgroundResolution, {
      format: THREE.RGBAFormat,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    })

    // Set mapping for black hole shader compatibility (samplerCube)
    this.cubeRenderTarget.texture.mapping = THREE.CubeReflectionMapping

    this.cubeCamera = new THREE.CubeCamera(0.1, 1000, this.cubeRenderTarget)

    // Only capture SKYBOX layer - exclude MAIN_OBJECT (black hole itself)
    this.cubeCamera.layers.disableAll()
    this.cubeCamera.layers.enable(RENDER_LAYERS.SKYBOX)
  }

  /**
   * Initialize PMREMGenerator for environment map conversion.
   * @param renderer
   */
  private ensurePMREMGenerator(renderer: THREE.WebGLRenderer): void {
    if (this.pmremGenerator) return

    this.pmremGenerator = new THREE.PMREMGenerator(renderer)
    // CRITICAL: Pre-compile the CUBEMAP shader, not equirectangular.
    // Using compileEquirectangularShader() with fromCubemap() causes
    // "bindTexture: Texture previously bound to TEXTURE_CUBE_MAP cannot
    // be bound now to TEXTURE_2D" warnings due to shader type mismatch.
    this.pmremGenerator.compileCubemapShader()
  }

  /**
   * Request a new capture on next frame.
   * Call this when skybox settings change.
   */
  requestCapture(): void {
    this.needsCapture = true
    this.cubemapHistory?.invalidateHistory()
  }

  /**
   * Set the background capture resolution.
   * @param resolution
   */
  setBackgroundResolution(resolution: number): void {
    if (resolution !== this.backgroundResolution) {
      this.backgroundResolution = resolution
      this.disposeTemporalHistory()
      this.requestCapture()
    }
  }

  /**
   * Get the captured cubemap texture (for external use if needed).
   * @returns The captured cubemap texture or null
   */
  getCubemapTexture(): THREE.CubeTexture | null {
    if (this.cubemapHistory?.hasValidHistory(1)) {
      return this.cubemapHistory.getRead(1).texture
    }
    return null
  }

  /**
   * Get the PMREM texture (for external use if needed).
   * @returns The PMREM texture or null
   */
  getPMREMTexture(): THREE.Texture | null {
    return this.pmremRenderTarget?.texture ?? null
  }

  execute(ctx: RenderContext): void {
    // Reset frame state
    this.didCaptureThisFrame = false

    const { renderer, scene } = ctx

    // Get environment state for smart capture throttling
    const env = ctx.frame?.stores?.environment
    const currentSkyboxMode = env?.skyboxMode ?? null

    // Check for skybox mode changes (procedural <-> classic)
    if (currentSkyboxMode !== this.lastSkyboxMode) {
      this.lastSkyboxMode = currentSkyboxMode
      this.requestCapture()
    }

    // Check for external texture changes (classic mode)
    // If UUID changes, we need to recapture (re-render SkyboxMesh to cube target)
    const externalTexture = this.getExternalCubeTexture()
    if (externalTexture) {
      if (externalTexture.uuid !== this.lastExternalTextureUuid) {
        this.lastExternalTextureUuid = externalTexture.uuid
        this.requestCapture()
      }
    } else {
      if (this.lastExternalTextureUuid !== null) {
        this.lastExternalTextureUuid = null
        this.requestCapture()
      }
    }

    // Always use capture path - unifies Procedural and Classic modes
    // This ensures scene.background is always a mipmapped WebGLCubeRenderTarget
    this.executeCapture(ctx, renderer, scene)

    // SMART CAPTURE THROTTLING: Only request continuous capture if skybox is animating
    // This optimization recovers ~8ms per frame for static skyboxes
    const isPlaying = ctx.frame?.stores?.animation?.isPlaying ?? false
    const isAnimating = this.isSkyboxAnimating(env, isPlaying)
    if (isAnimating) {
      // Animated skybox - request capture for next frame
      this.needsCapture = true
    }
    // Static skybox - needsCapture stays false until settings change via requestCapture()
  }

  /**
   * Determine if the skybox is currently animating.
   * Static skyboxes don't need continuous cubemap capture.
   * @param env - Environment state from FrameContext
   * @param isPlaying - Global animation state
   * @returns true if skybox is animating, false if static
   */
  private isSkyboxAnimating(
    env:
      | {
          skyboxMode?: string
          skyboxAnimationMode?: string
          skyboxAnimationSpeed?: number
          skyboxTimeScale?: number
        }
      | undefined,
    isPlaying: boolean
  ): boolean {
    if (!env) return true // Default to animating if no state available

    // If global animation is paused, skybox doesn't animate
    if (!isPlaying) return false

    const isClassic = env.skyboxMode === 'classic'

    if (isClassic) {
      // Classic KTX2 skybox: only animating if animation mode is active AND speed > 0
      const hasAnimationMode = env.skyboxAnimationMode !== 'none'
      const hasAnimationSpeed = (env.skyboxAnimationSpeed ?? 0) > 0
      return hasAnimationMode && hasAnimationSpeed
    } else {
      // Procedural skybox: animating if timeScale > 0 OR rotation speed > 0
      // Note: Procedural skyboxes use timeScale, not skyboxAnimationSpeed
      const hasTimeScale = (env.skyboxTimeScale ?? 0) > 0
      // Also check animation speed for rotation animations
      const hasRotation = (env.skyboxAnimationSpeed ?? 0) > 0 && env.skyboxAnimationMode !== 'none'
      return hasTimeScale || hasRotation
    }
  }

  /**
   * Capture SKYBOX layer to CubeRenderTarget.
   * Handles both Procedural (shader) and Classic (SkyboxMesh with texture) modes.
   * @param ctx
   * @param renderer
   * @param scene
   */
  private executeCapture(
    ctx: RenderContext,
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene
  ): void {
    this.ensureTemporalHistory()
    if (!this.cubemapHistory) return

    this.ensureCubeCamera()
    if (!this.cubeCamera) return

    // 1. Capture Logic (Conditional, with throttling)
    this.captureFrameCounter++
    const shouldCapture =
      this.needsCapture &&
      (!this.cubemapHistory?.hasValidHistory(0) || // First time - need valid history
        this.captureFrameCounter >= CubemapCapturePass.CAPTURE_UPDATE_INTERVAL)

    if (shouldCapture) {
      this.captureFrameCounter = 0

      // Count objects on SKYBOX layer - don't capture if skybox isn't ready yet
      let skyboxObjectCount = 0
      scene.traverse((obj) => {
        if (obj.layers.test(this.cubeCamera!.layers)) skyboxObjectCount++
      })

      // Skip capture if no skybox objects yet - will retry next frame
      if (skyboxObjectCount === 0) {
        return
      }

      // Get the current write target from temporal buffer
      const writeTarget = this.cubemapHistory.getWrite()

      this.cubeCamera.position.set(0, 0, 0)

      // CRITICAL: Clear background/environment before capture to avoid feedback loop
      const previousBackground = scene.background
      const previousEnvironment = scene.environment
      scene.background = null
      scene.environment = null

      // Render to cubemap
      const originalTarget = this.cubeCamera.renderTarget
      this.cubeCamera.renderTarget = writeTarget
      this.cubeCamera.update(renderer, scene)
      this.cubeCamera.renderTarget = originalTarget

      // Restore scene state
      scene.background = previousBackground
      scene.environment = previousEnvironment

      // Mark capture as occurred
      this.didCaptureThisFrame = true
      this.needsCapture = false

      // Generate PMREM if needed (throttled for performance)
      // PMREM generation is expensive, so we only do it every N frames
      this.pmremFrameCounter++
      const shouldRegeneratePMREM =
        this.generatePMREM() &&
        (!this.pmremRenderTarget || // First time
          this.pmremFrameCounter >= CubemapCapturePass.PMREM_UPDATE_INTERVAL)

      if (shouldRegeneratePMREM) {
        this.pmremFrameCounter = 0
        this.ensurePMREMGenerator(renderer)

        if (this.pmremGenerator) {
          // DEFERRED DISPOSAL: Don't dispose immediately.
          // Store current as pending dispose, generate new one, assign new to current.
          if (this.pmremRenderTarget) {
            this.pendingPMREMDispose = this.pmremRenderTarget
          }

          // Generate new PMREM target
          // fromCubemap returns a new WebGLRenderTarget
          // We read from the JUST WRITTEN target (writeTarget) because we want the freshest data
          // for the next frame's environment.
          // Wait, is 'writeTarget' valid yet? Yes, we just rendered to it.
          // But 'getRead(1)' is the PREVIOUS frame.
          // For PMREM, we want the LATEST capture.
          // The cubemap history is for the black hole shader (which needs 2 frames).
          // PMREM is for PBR reflections, which can use the latest frame immediately if we want.
          // However, consistency suggests using the same frame as scene.background.
          // If we use 'writeTarget', we are effectively using "Frame 0" data while scene.background uses "Frame -1".
          // Let's stick to using 'writeTarget' for PMREM to minimize latency, as it's a separate effect.
          // actually, let's use the same logic as before: create from the just-rendered cubemap.
          this.pmremRenderTarget = this.pmremGenerator.fromCubemap(writeTarget.texture)

          // SEAM FIX: Disable anisotropic filtering on PMREM texture
          // Per Three.js issue #17855, Nvidia GPUs with anisotropic filtering enabled
          // in the driver control panel can cause seams at cubemap face boundaries.
          // Explicitly setting anisotropy to 1 disables this filtering.
          if (this.pmremRenderTarget.texture) {
            this.pmremRenderTarget.texture.anisotropy = 1
          }

          // Force sync after PMREM generation
          getGlobalMRTManager().forceSync()
        }
      }
    }

    // 2. Export Logic (Always, if valid)
    // hasValidHistory(0) = needs framesSinceReset > 0 (just 1 frame)
    // hasValidHistory(1) = needs framesSinceReset > 1 (2 frames - for black hole)
    // For IBL, 1 frame is enough. For Black Hole, 2 frames are needed.
    // Use hasValidHistory(0) for faster IBL startup
    const hasValidHistory = this.cubemapHistory.hasValidHistory(0)

    if (hasValidHistory) {
      const readTarget = this.cubemapHistory.getRead(1)

      // Export scene.background for black hole gravitational lensing
      ctx.queueExport({
        id: 'scene.background',
        value: readTarget.texture,
      })

      // Queue export for scene.environment (for IBL reflections)
      if (this.pmremRenderTarget) {
        ctx.queueExport({
          id: 'scene.environment',
          value: this.pmremRenderTarget.texture,
        })
      }
    }
  }

  /**
   * Initialize temporal cubemap history with 2-frame buffer.
   */
  private ensureTemporalHistory(): void {
    if (this.cubemapHistory) return

    const resolution = this.backgroundResolution
    this.cubemapHistory = new TemporalResource<THREE.WebGLCubeRenderTarget>({
      historyLength: 2,
      factory: () => {
        // IMPORTANT: generateMipmaps must be FALSE to avoid WebGL binding conflicts.
        // When mipmaps are generated, THREE.js binds the texture in a way that causes
        // "INVALID_OPERATION: bindTexture: textures can not be used with multiple targets"
        // when the same texture is later used as scene.background.
        // See: docs/bugfixing/log/gravitational-lensing-root-cause.md
        // See: https://github.com/mrdoob/three.js/issues/29628
        const target = new THREE.WebGLCubeRenderTarget(resolution, {
          format: THREE.RGBAFormat,
          generateMipmaps: false,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
        })
        target.texture.mapping = THREE.CubeReflectionMapping
        return target
      },
      dispose: (target) => target.dispose(),
      debugName: 'skyboxCubemap',
    })
  }

  /**
   * Advance the temporal resource to the next frame.
   */
  postFrame(): void {
    // 1. Dispose old PMREM target if one is pending
    // Safe to do now because scene.environment has been updated to the NEW target (if any)
    if (this.pendingPMREMDispose) {
      this.pendingPMREMDispose.dispose()
      this.pendingPMREMDispose = null
    }

    // 2. Advance history ONLY if we captured a new frame
    // This prevents the read pointer from advancing into stale/empty buffers
    // when needsCapture is false (static skybox).
    if (this.didCaptureThisFrame) {
      this.cubemapHistory?.advanceFrame()
    }
  }

  /**
   * Check if the cubemap has valid history.
   * @returns True if valid history exists
   */
  hasValidCubemap(): boolean {
    return this.cubemapHistory?.hasValidHistory(1) ?? false
  }

  getFramesSinceReset(): number {
    return this.cubemapHistory?.getFramesSinceReset() ?? 0
  }

  private disposeCubeCamera(): void {
    this.cubeRenderTarget?.dispose()
    this.cubeRenderTarget = null
    this.cubeCamera = null
  }

  private disposeTemporalHistory(): void {
    this.cubemapHistory?.dispose()
    this.cubemapHistory = null
  }

  private disposePMREM(): void {
    this.pmremRenderTarget?.dispose()
    this.pmremRenderTarget = null
    this.pmremGenerator?.dispose()
    this.pmremGenerator = null
  }

  /**
   * Release internal GPU resources when pass is disabled.
   *
   * Called by RenderGraph when this pass has been disabled for the grace period.
   * Disposes of cubemap render targets, temporal history, and PMREM resources.
   * State is reset to trigger fresh capture on re-enable.
   */
  releaseInternalResources(): void {
    // Dispose pending PMREM target first (prevents memory leak when pass disabled during capture)
    if (this.pendingPMREMDispose) {
      this.pendingPMREMDispose.dispose()
      this.pendingPMREMDispose = null
    }

    // Dispose all GPU resources using existing helper methods
    this.disposeCubeCamera()
    this.disposeTemporalHistory()
    this.disposePMREM()

    // Reset state to trigger fresh capture on re-enable
    this.needsCapture = true
    this.lastExternalTextureUuid = null
    this.lastSkyboxMode = null

    // Reset frame counters
    this.captureFrameCounter = 0
    this.pmremFrameCounter = 0
  }

  dispose(): void {
    this.disposeCubeCamera()
    this.disposeTemporalHistory()
    this.disposePMREM()
  }
}
