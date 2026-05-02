/**
 * WebGPU Type Definitions
 *
 * Core type definitions for the WebGPU rendering backend.
 * These types mirror the WebGL render graph types while adapting
 * to WebGPU's command-based architecture.
 *
 * @module rendering/webgpu/core/types
 */

// =============================================================================
// Device & Context Types
// =============================================================================

/**
 * WebGPU device capabilities and limits.
 */
export interface WebGPUCapabilities {
  /** Maximum texture dimension (width/height) */
  maxTextureDimension2D: number
  /** Maximum storage buffer binding size */
  maxStorageBufferBindingSize: number
  /** Maximum uniform buffer binding size */
  maxUniformBufferBindingSize: number
  /** Maximum compute workgroup size X */
  maxComputeWorkgroupSizeX: number
  /** Maximum compute workgroup size Y */
  maxComputeWorkgroupSizeY: number
  /** Maximum compute workgroup size Z */
  maxComputeWorkgroupSizeZ: number
  /** Maximum compute invocations per workgroup */
  maxComputeInvocationsPerWorkgroup: number
  /** Maximum bind groups */
  maxBindGroups: number
  /** Supports timestamp queries */
  timestampQuery: boolean
  /** Adapter info string */
  adapterInfo: string
}

/**
 * WebGPU initialization success result.
 */
export interface WebGPUInitSuccess {
  success: true
  adapter: GPUAdapter
  device: GPUDevice
  context: GPUCanvasContext
  format: GPUTextureFormat
  capabilities: WebGPUCapabilities
}

/**
 * Structured initialization failure codes.
 *
 * Each code identifies a distinct failure mode at the WebGPU init
 * boundary. Tests, telemetry, and the in-app error overlay can all
 * branch on the code without parsing the human-readable `message`.
 *
 * - `NO_NAVIGATOR_GPU`        — `navigator.gpu` is undefined. Browser /
 *   environment lacks WebGPU support entirely (older browser, insecure
 *   context, secure-context-required iframe, headless without flags).
 * - `ADAPTER_REQUEST_FAILED`  — `navigator.gpu.requestAdapter()`
 *   resolved to `null`. No GPU could be provisioned (driver missing,
 *   blocklist hit, virtual machine without passthrough).
 * - `DEVICE_REQUEST_FAILED`   — `adapter.requestDevice()` rejected or
 *   threw. Adapter was provisioned but the device couldn't be created
 *   (limits unsatisfiable, feature unavailable, OOM at allocation).
 * - `CONTEXT_CONFIGURE_FAILED` — `canvas.getContext('webgpu')` returned
 *   null or `context.configure()` threw. Canvas refused the device.
 * - `INTERNAL_ERROR`          — anything else thrown during init.
 */
export type WebGPUInitErrorCode =
  | 'NO_NAVIGATOR_GPU'
  | 'ADAPTER_REQUEST_FAILED'
  | 'DEVICE_REQUEST_FAILED'
  | 'CONTEXT_CONFIGURE_FAILED'
  | 'INTERNAL_ERROR'

/**
 * WebGPU initialization failure result.
 *
 * `error` is a human-readable string for backwards compatibility and
 * for surfacing through the `data-renderer-error` DOM attribute. New
 * consumers should branch on `code` instead — that's the part the
 * test suite + telemetry rely on.
 */
export interface WebGPUInitFailure {
  success: false
  /** Structured failure code; see {@link WebGPUInitErrorCode}. */
  code: WebGPUInitErrorCode
  /** Human-readable error message; safe to display to users. */
  error: string
  /**
   * Underlying cause when one is available (`adapter.requestDevice`
   * rejection, `getContext` exception). Optional because some failure
   * modes (e.g. adapter request returning `null`) don't carry one.
   */
  cause?: unknown
}

/**
 * WebGPU initialization result (discriminated union).
 */
export type WebGPUInitResult = WebGPUInitSuccess | WebGPUInitFailure

/**
 * Typed initialization error class.
 *
 * Thrown internally by `WebGPUDevice.doInitialize` so the public
 * `initialize()` `.catch` can map every failure mode to a specific
 * `WebGPUInitErrorCode` without string-matching the message text.
 * Other throw sites (raw `new Error(...)`) collapse to
 * `INTERNAL_ERROR` at the boundary.
 */
export class WebGPUInitError extends Error {
  readonly code: WebGPUInitErrorCode
  override readonly cause?: unknown

  constructor(code: WebGPUInitErrorCode, message: string, cause?: unknown) {
    super(message)
    this.name = 'WebGPUInitError'
    this.code = code
    if (cause !== undefined) this.cause = cause
  }
}

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
  mode: ResourceSizeMode
  width?: number
  height?: number
  fraction?: number
}

/**
 * Resource type enumeration.
 */
export type WebGPUResourceType = 'texture' | 'renderTarget' | 'storageTexture' | 'cubemap'

/**
 * Configuration for a WebGPU render resource.
 */
export interface WebGPURenderResourceConfig {
  /** Unique identifier */
  id: string
  /** Resource type */
  type: WebGPUResourceType
  /** Size policy */
  size: ResourceSize
  /** Texture format (default: rgba16float for HDR) */
  format?: GPUTextureFormat
  /** Usage flags */
  usage?: GPUTextureUsageFlags
  /** Sample count for MSAA (1 for no MSAA) */
  sampleCount?: number
  /** Whether resource persists across frames (for temporal effects) */
  persistent?: boolean
  /** Mip level count */
  mipLevelCount?: number
  /** Array layer count (for cubemaps = 6) */
  arrayLayerCount?: number
}

/**
 * Resolved WebGPU resource.
 */
export interface WebGPUResource {
  config: WebGPURenderResourceConfig
  texture: GPUTexture
  view: GPUTextureView
  /** Sampler for texture reads */
  sampler: GPUSampler
  /** Resolved dimensions */
  width: number
  height: number
}

// =============================================================================
// Pass Types
// =============================================================================

/**
 * Access mode for resource bindings.
 */
export type AccessMode = 'read' | 'write' | 'readwrite' | 'storage'

/**
 * Declares how a pass accesses a resource.
 */
export interface WebGPUResourceAccess {
  resourceId: string
  access: AccessMode
  /** Binding slot in shader */
  binding: number
  /** Bind group index */
  group?: number
}

/**
 * Configuration for a WebGPU render pass.
 */
export interface WebGPURenderPassConfig {
  id: string
  name?: string
  inputs: WebGPUResourceAccess[]
  outputs: WebGPUResourceAccess[]
  enabled?: (frame: WebGPUFrameContext | null) => boolean
  priority?: number
  /** Whether this is a compute pass */
  isCompute?: boolean
  /** Workgroup size for compute passes */
  workgroupSize?: [number, number, number]
  /**
   * If true, when disabled, alias output to input instead of copying.
   * More efficient but may break multi-input passes.
   */
  skipPassthrough?: boolean
  /**
   * Grace period in frames before releasing internal resources when disabled.
   * Prevents memory churn on frequent toggles. Defaults to 60 (~1 second at 60fps).
   */
  disableGracePeriod?: number
  /**
   * If true, keep resources allocated even when disabled.
   * Useful for passes that need instant re-enable without reallocation.
   */
  keepResourcesWhenDisabled?: boolean
}

/**
 * WebGPU render pass interface.
 */
export interface WebGPURenderPass {
  readonly id: string
  readonly config: WebGPURenderPassConfig

  /**
   * Initialize GPU resources (pipelines, bind group layouts).
   * Called once when pass is added to graph.
   */
  initialize(ctx: WebGPUSetupContext): Promise<void>

  /**
   * Encode render commands.
   * Called each frame.
   */
  execute(ctx: WebGPURenderContext): void

  /**
   * Optional post-frame hook for temporal resources.
   */
  postFrame?(): void

  /**
   * Cleanup GPU resources.
   */
  dispose(): void

  /**
   * Release internal resources when disabled.
   */
  releaseInternalResources?(): void

  /**
   * Get draw statistics from the last execute() call.
   * Returns null if the pass doesn't track draw stats.
   */
  getDrawStats?(): WebGPUPassDrawStats | null

  /**
   * Transfer reusable state from a predecessor pass of the same type.
   * Called by the render graph during warm swap before the predecessor is disposed.
   * The default implementation does nothing. Renderers override this to preserve
   * compute simulation state (coin buffers, density textures) across pipeline rebuilds
   * triggered by non-structural config changes (e.g. color algorithm).
   */
  adoptFrom?(predecessor: WebGPURenderPass): void

  /**
   * Reverse `adoptFrom`: transfer any adopted compute state back to the predecessor.
   * Called on warm-swap abort/error paths BEFORE disposing this pass, so the predecessor
   * (which is still active in the graph) reclaims its GPU state instead of having it
   * destroyed. No-op if this pass never adopted anything.
   */
  revertComputeStateTo?(predecessor: WebGPURenderPass): void
}

// =============================================================================
// Context Types
// =============================================================================

/**
 * Frame context captured at frame start.
 */
export interface WebGPUFrameContext {
  /** Frame number */
  frameNumber: number
  /** Delta time */
  delta: number
  /** Total elapsed time */
  time: number
  /** Viewport size */
  size: { width: number; height: number }
  /** Store snapshots */
  stores: Record<string, unknown>
}

/**
 * Setup context for pass initialization.
 */
export interface WebGPUSetupContext {
  device: GPUDevice
  format: GPUTextureFormat
  capabilities: WebGPUCapabilities
  /** Create a sampler with given descriptor */
  createSampler(descriptor?: GPUSamplerDescriptor): GPUSampler
  /** Register a bind group layout */
  registerBindGroupLayout(id: string, layout: GPUBindGroupLayout): void
  /** Get a registered bind group layout */
  getBindGroupLayout(id: string): GPUBindGroupLayout | null
}

/**
 * Render context passed to each pass during execution.
 */
export interface WebGPURenderContext {
  /** GPU device */
  device: GPUDevice
  /** Command encoder for this frame */
  encoder: GPUCommandEncoder
  /** Current frame context */
  frame: WebGPUFrameContext | null
  /** Viewport size */
  size: { width: number; height: number }

  /**
   * Get a resource's texture.
   */
  getTexture(resourceId: string): GPUTexture | null

  /**
   * Get a resource's texture view.
   */
  getTextureView(resourceId: string): GPUTextureView | null

  /**
   * Get the write target for a resource.
   */
  getWriteTarget(resourceId: string): GPUTextureView | null

  /**
   * Get the read texture view for ping-pong resources.
   */
  getReadTextureView(resourceId: string): GPUTextureView | null

  /**
   * Get a sampler for a resource.
   */
  getSampler(resourceId: string): GPUSampler | null

  /**
   * Get the resolved resource object.
   */
  getResource(resourceId: string): WebGPUResource | null

  /**
   * Begin a render pass.
   */
  beginRenderPass(descriptor: GPURenderPassDescriptor): GPURenderPassEncoder

  /**
   * Begin a compute pass.
   */
  beginComputePass(descriptor?: GPUComputePassDescriptor): GPUComputePassEncoder

  /**
   * Get the canvas texture view for final output.
   */
  getCanvasTextureView(): GPUTextureView
}

// =============================================================================
// Frame Statistics
// =============================================================================

/**
 * Per-pass timing information.
 */
export interface WebGPUPassTiming {
  passId: string
  gpuTimeMs: number
  /** GPU time spent in compute passes (FFT, density grid). 0 if no compute work. */
  computeGpuTimeMs: number
  /** GPU time spent in render passes (volume raymarch, post-processing). 0 if no render work. */
  renderGpuTimeMs: number
  cpuTimeMs: number
  skipped: boolean
}

/**
 * Draw statistics from a single pass.
 */
export interface WebGPUPassDrawStats {
  /** Number of draw calls */
  calls: number
  /** Number of triangles drawn */
  triangles: number
  /** Number of vertices processed */
  vertices: number
  /** Number of lines drawn */
  lines: number
  /** Number of points drawn */
  points: number
}

/**
 * Aggregated draw statistics for the entire frame.
 */
export interface WebGPUFrameDrawStats {
  /** Total draw calls across all passes */
  calls: number
  /** Total triangles drawn */
  triangles: number
  /** Total vertices processed */
  vertices: number
  /** Total lines drawn */
  lines: number
  /** Total points drawn */
  points: number
}

/**
 * Frame statistics from graph execution.
 */
/** CPU time breakdown for the three phases of frame execution. */
export interface WebGPUCpuBreakdown {
  /** Store captures + context creation */
  setupMs: number
  /** Pass execution loop */
  passesMs: number
  /** Command buffer submit + post-frame hooks + stat aggregation */
  submitMs: number
}

/** Aggregated frame statistics from render graph execution. */
export interface WebGPUFrameStats {
  totalTimeMs: number
  passTiming: WebGPUPassTiming[]
  commandBufferCount: number
  vramUsage: number
  /** Aggregated draw statistics for the frame */
  drawStats: WebGPUFrameDrawStats
  /** CPU time breakdown by frame phase */
  cpuBreakdown: WebGPUCpuBreakdown
}
