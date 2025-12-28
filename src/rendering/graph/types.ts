/**
 * Render Graph Type Definitions
 *
 * Core interfaces for the declarative render graph system.
 * Based on industry patterns from Frostbite, Unity SRP, and Unreal RDG.
 *
 * Key concepts:
 * - RenderResource: Describes a GPU resource (texture, render target, MRT)
 * - RenderPass: A unit of rendering work with explicit inputs/outputs
 * - ResourceAccess: Declares how a pass accesses a resource
 * - RenderContext: Execution context passed to each pass
 *
 * @module rendering/graph/types
 */

import type * as THREE from 'three'

import type { ExternalResourceId, PendingExport } from './ExternalBridge'
import type { FrozenFrameContext } from './FrameContext'

// =============================================================================
// Resource Types
// =============================================================================

/**
 * Size policy for render resources.
 */
export type ResourceSizeMode = 'screen' | 'fixed' | 'fraction'

/**
 * Resource size configuration.
 */
export interface ResourceSize {
  /** How the size is determined */
  mode: ResourceSizeMode
  /** Fixed width (for 'fixed' mode) */
  width?: number
  /** Fixed height (for 'fixed' mode) */
  height?: number
  /** Fraction of screen size (for 'fraction' mode, e.g., 0.5 for half-res) */
  fraction?: number
}

/**
 * Resource type enumeration.
 */
export type ResourceType = 'texture' | 'renderTarget' | 'mrt' | 'cubemap'

/**
 * Configuration for a render resource.
 *
 * Resources are GPU objects managed by the graph's ResourcePool.
 * The graph handles allocation, resizing, and disposal automatically.
 */
export interface RenderResourceConfig {
  /** Unique identifier for this resource */
  id: string

  /** Type of GPU resource */
  type: ResourceType

  /** Size policy */
  size: ResourceSize

  /** Pixel format (default: RGBAFormat) */
  format?: THREE.PixelFormat

  /** Internal GPU format for HDR (e.g., RGBA16F) */
  internalFormat?: string

  /** Texture data type (default: UnsignedByteType, use FloatType for HDR) */
  dataType?: THREE.TextureDataType

  /** Number of MRT attachments (for 'mrt' type) */
  attachmentCount?: number

  /** Per-attachment formats for MRT */
  attachmentFormats?: THREE.PixelFormat[]

  /** MSAA sample count (0 or 1 for no MSAA) */
  samples?: number

  /** Whether resource persists across frames (for temporal effects) */
  persistent?: boolean

  /** Include depth buffer */
  depthBuffer?: boolean

  /** Include stencil buffer */
  stencilBuffer?: boolean

  /** Texture min filtering (default: LinearFilter) */
  minFilter?: THREE.MinificationTextureFilter
  /** Texture mag filtering (default: LinearFilter) */
  magFilter?: THREE.MagnificationTextureFilter

  /** Texture wrapping (default: ClampToEdgeWrapping) */
  wrapS?: THREE.Wrapping
  wrapT?: THREE.Wrapping

  /** Color space for the texture (default: LinearSRGBColorSpace for HDR, SRGBColorSpace for LDR) */
  colorSpace?: THREE.ColorSpace

  /** Create a DepthTexture for this render target (default: false) */
  depthTexture?: boolean

  /** Depth texture format (default: DepthFormat) */
  depthTextureFormat?: THREE.PixelFormat

  /** Depth texture data type (default: UnsignedShortType) */
  depthTextureType?: THREE.TextureDataType

  /** Depth texture min filter (default: NearestFilter) */
  depthTextureMinFilter?: THREE.TextureFilter

  /** Depth texture mag filter (default: NearestFilter) */
  depthTextureMagFilter?: THREE.TextureFilter

  /** Which texture to expose via getTexture/getReadTexture (default: 'color') */
  textureRole?: 'color' | 'depth'
}

/**
 * Access mode for resource bindings.
 */
export type AccessMode = 'read' | 'write' | 'readwrite'

/**
 * Declares how a pass accesses a resource.
 *
 * The compiler uses this information to:
 * - Order passes correctly (writes before reads)
 * - Detect read-while-write hazards
 * - Allocate ping-pong buffers when needed
 */
export interface ResourceAccess {
  /** Resource identifier */
  resourceId: string

  /** How the resource is accessed */
  access: AccessMode

  /** Optional binding name in shader (defaults to resourceId) */
  binding?: string

  /** For MRT: which attachment index (or 'depth' for depth texture) */
  attachment?: number | 'depth'
}

// =============================================================================
// Pass Types
// =============================================================================

/**
 * Configuration for a render pass.
 */
export interface RenderPassConfig {
  /** Unique identifier for this pass */
  id: string

  /** Human-readable name for debugging */
  name?: string

  /** Resources this pass reads from */
  inputs: ResourceAccess[]

  /** Resources this pass writes to */
  outputs: ResourceAccess[]

  /**
   * Function to determine if pass should execute this frame.
   *
   * Receives frozen frame context to allow reading store state safely.
   * If frame context is null (first frame before stores configured), pass runs.
   */
  enabled?: (frame: FrozenFrameContext | null) => boolean

  /** Optional priority hint for passes with no dependencies */
  priority?: number

  /**
   * Skip automatic passthrough when this pass is disabled.
   *
   * By default, when a pass is disabled, the render graph copies the first input
   * to the first output to maintain the resource chain. This is correct for
   * single-input passes but WRONG for multi-input compositing passes where
   * data from other inputs would be lost.
   *
   * Set to true for:
   * - Multi-input compositing passes (e.g., normalComposite, gravityComposite)
   * - Passes where passthrough would produce incorrect results
   *
   * When skipPassthrough is true, resource aliasing is used instead:
   * - The output resource is aliased to the first input
   * - Downstream passes read from the aliased source directly
   * - No texture copy occurs
   *
   * @default false
   */
  skipPassthrough?: boolean

  /**
   * Number of frames to wait before deallocating internal resources when disabled.
   *
   * When a pass transitions from enabled to disabled, the render graph waits
   * this many frames before calling releaseInternalResources(). This prevents
   * thrashing when effects are toggled frequently (e.g., during UI interaction).
   *
   * @default 60 (~1 second at 60fps)
   */
  disableGracePeriod?: number

  /**
   * Skip automatic resource deallocation when disabled.
   *
   * Set to true for passes where reallocation cost exceeds memory savings,
   * or where maintaining state between enable/disable cycles is important.
   *
   * @default false
   */
  keepResourcesWhenDisabled?: boolean
}

/**
 * Render pass interface.
 *
 * Passes are the building blocks of the render graph.
 * Each pass declares its resource dependencies and implements execute().
 */
export interface RenderPass {
  /** Unique identifier */
  readonly id: string

  /** Pass configuration */
  readonly config: RenderPassConfig

  /**
   * Execute this pass.
   *
   * @param ctx - Render context with access to resources and renderer
   */
  execute(ctx: RenderContext): void

  /**
   * Optional post-frame hook for temporal resource advancement.
   */
  postFrame?(): void

  /**
   * Optional cleanup when pass is removed from graph.
   */
  dispose?(): void

  /**
   * Optional: Release internal GPU resources when pass is disabled.
   *
   * Called when a pass transitions from enabled to disabled state
   * (after the grace period configured by disableGracePeriod).
   *
   * Should dispose of internal render targets and heavy resources,
   * but NOT materials/geometry that are cheap to keep and expensive
   * to recreate (shader recompilation).
   *
   * Resources will be lazily reallocated when the pass is re-enabled
   * via the existing ensureInitialized() pattern in execute().
   *
   * @example
   * ```typescript
   * releaseInternalResources(): void {
   *   // Dispose render targets (heavy)
   *   this.internalTarget?.dispose();
   *   this.internalTarget = null;
   *
   *   // Reset size tracking to trigger reallocation
   *   this.lastWidth = 0;
   *   this.lastHeight = 0;
   *
   *   // Keep materials/geometry - they're cheap and avoid recompilation
   * }
   * ```
   */
  releaseInternalResources?(): void
}

// =============================================================================
// Execution Context
// =============================================================================

/**
 * Context passed to each pass during execution.
 *
 * Provides access to:
 * - Resolved GPU resources (render targets, textures)
 * - Three.js renderer
 * - Scene and camera
 * - Frame timing information
 */
export interface RenderContext {
  /** Three.js WebGL renderer */
  renderer: THREE.WebGLRenderer

  /** Current scene */
  scene: THREE.Scene

  /** Current camera */
  camera: THREE.Camera

  /** Frame delta time in seconds */
  delta: number

  /** Total elapsed time in seconds */
  time: number

  /** Current viewport size */
  size: { width: number; height: number }

  /**
   * Get a resource's GPU object.
   *
   * For render targets, returns WebGLRenderTarget.
   * For textures, returns Texture.
   *
   * @param resourceId - Resource identifier
   * @returns The GPU resource or null if not found
   */
  getResource<T = THREE.WebGLRenderTarget | THREE.Texture>(resourceId: string): T | null

  /**
   * Get the write target for a resource (handles ping-pong).
   *
   * For resources with read-while-write access, this returns
   * the ping-pong swap buffer.
   *
   * @param resourceId - Resource identifier
   * @returns The write target or null
   */
  getWriteTarget(resourceId: string): THREE.WebGLRenderTarget | null

  /**
   * Get the read target for a ping-pong resource.
   *
   * For non-ping-pong resources, returns the primary target.
   *
   * @param resourceId - Resource identifier
   * @returns The read target or null
   */
  getReadTarget(resourceId: string): THREE.WebGLRenderTarget | null

  /**
   * Get the read texture for a resource.
   *
   * @param resourceId - Resource identifier
   * @returns The read texture or null
   */
  getReadTexture(resourceId: string, attachment?: number | 'depth'): THREE.Texture | null

  /**
   * Get a frozen external resource captured at frame start.
   *
   * External resources are values from outside the render graph (scene.background,
   * store values, etc.) that are captured once at frame start and remain frozen
   * throughout frame execution.
   *
   * @param id - External resource identifier
   * @returns The captured value or null if not found/invalid
   */
  getExternal<T>(id: string): T | null

  /**
   * Get the frozen frame context.
   *
   * Contains all store state and external values captured at frame start.
   * This is the preferred way to access store state from passes, as it
   * guarantees consistent values throughout the frame.
   *
   * @returns Frozen frame context or null if not captured
   */
  readonly frame: FrozenFrameContext | null

  /**
   * Queue an export to be applied at frame end.
   *
   * Passes use this to export internal resources to external systems
   * (like scene.background, scene.environment). Exports are batched and
   * applied AFTER all passes complete to maintain consistent state.
   *
   * @example
   * ```typescript
   * // In a pass's execute() method:
   * ctx.queueExport({
   *   id: 'scene.background',
   *   value: myCubemapTexture
   * });
   * ```
   *
   * @param pending - The export to queue
   */
  queueExport<T>(pending: PendingExport<T>): void

  /**
   * Check if an export is registered with the bridge.
   *
   * @param id - External resource ID
   * @returns True if the export is registered
   */
  hasExportRegistered(id: ExternalResourceId): boolean
}

// =============================================================================
// Compiled Graph Types
// =============================================================================

/**
 * Result of graph compilation.
 *
 * Contains the execution order and resource allocation plan.
 */
export interface CompiledGraph {
  /** Passes in execution order */
  passes: RenderPass[]

  /** Resource allocation order */
  resourceOrder: string[]

  /** Resources that need ping-pong buffers */
  pingPongResources: Set<string>

  /** Detected issues (warnings, not errors) */
  warnings: string[]
}

/**
 * Graph compilation options.
 */
export interface CompileOptions {
  /** Enable verbose logging */
  debug?: boolean

  /** Validate resource bindings against shader uniforms */
  validateBindings?: boolean
}

// =============================================================================
// Graph Statistics (for performance monitoring)
// =============================================================================

/**
 * Per-pass timing information.
 */
export interface PassTiming {
  /** Pass identifier */
  passId: string

  /** GPU time in milliseconds (requires timer query extension) */
  gpuTimeMs: number

  /** CPU time in milliseconds */
  cpuTimeMs: number

  /** Whether the pass was skipped (disabled) */
  skipped: boolean
}

/**
 * Frame statistics from graph execution.
 */
export interface FrameStats {
  /** Total frame time in milliseconds */
  totalTimeMs: number

  /** Per-pass timing breakdown */
  passTiming: PassTiming[]

  /** Number of render target switches */
  targetSwitches: number

  /** Estimated VRAM usage in bytes */
  vramUsage: number
}
