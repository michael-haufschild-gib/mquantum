/**
 * Shared Graph Types
 *
 * API-agnostic type definitions for the render graph system.
 * These types are shared between WebGL2 and WebGPU backends,
 * allowing the GraphCompiler to work with both.
 *
 * Key concepts:
 * - BaseRenderPass: Core pass interface with only metadata needed for compilation
 * - BaseRenderPassConfig: Configuration without GPU-specific types
 * - ResourceAccess: Declares how a pass accesses a resource (read/write)
 * - CompiledGraph: Result of graph compilation
 *
 * Backend-specific types extend these with GPU-specific properties.
 *
 * @module lib/graph-types
 */

// =============================================================================
// Resource Access Types (Shared)
// =============================================================================

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
// Base Pass Types (Shared for Compiler)
// =============================================================================

/**
 * Base configuration for a render pass.
 *
 * Contains only the metadata needed for graph compilation.
 * Backend-specific configs extend this with GPU-specific fields.
 */
export interface BaseRenderPassConfig {
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
   * Receives frozen frame context (unknown type to allow flexibility).
   * If frame context is null (first frame), pass runs.
   */
  enabled?: (frame: unknown) => boolean

  /** Optional priority hint for passes with no dependencies */
  priority?: number

  /**
   * Skip automatic passthrough when this pass is disabled.
   *
   * When true, uses resource aliasing instead of texture copy.
   * @default false
   */
  skipPassthrough?: boolean

  /**
   * Number of frames to wait before deallocating internal resources when disabled.
   * @default 60
   */
  disableGracePeriod?: number

  /**
   * Skip automatic resource deallocation when disabled.
   * @default false
   */
  keepResourcesWhenDisabled?: boolean
}

/**
 * Base render pass interface for graph compilation.
 *
 * Contains only the fields the GraphCompiler needs.
 * Backend-specific passes extend this with execute(), dispose(), etc.
 */
export interface BaseRenderPass {
  /** Unique identifier */
  readonly id: string

  /** Pass configuration */
  readonly config: BaseRenderPassConfig

  /**
   * Optional cleanup when pass is removed.
   */
  dispose?(): void

  /**
   * Optional: Release internal GPU resources when pass is disabled.
   */
  releaseInternalResources?(): void
}

// =============================================================================
// Base Resource Config (Shared for Compiler)
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
 * Base configuration for a render resource.
 *
 * Contains only the metadata needed for graph compilation.
 * Backend-specific configs extend this with format, depth, etc.
 */
export interface BaseRenderResourceConfig {
  /** Unique identifier for this resource */
  id: string

  /** Size policy */
  size: ResourceSize
}

// =============================================================================
// Compiled Graph Types (Shared)
// =============================================================================

/**
 * Result of graph compilation.
 *
 * Contains the execution order and resource allocation plan.
 */
export interface CompiledGraph<TPass extends BaseRenderPass = BaseRenderPass> {
  /** Passes in execution order */
  passes: TPass[]

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
// Statistics Types (Shared)
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

// =============================================================================
// Resource State Types (Shared)
// =============================================================================

/**
 * Possible states for a managed resource.
 */
export enum ResourceState {
  /**
   * Resource has been created but not yet rendered to.
   * This is the initial state for all resources.
   */
  Created = 'created',

  /**
   * Resource is currently bound as a render target.
   * Passes can write to the resource in this state.
   */
  WriteTarget = 'write_target',

  /**
   * Resource has been written to and is available for shader reads.
   * Passes can sample from the resource in this state.
   */
  ShaderRead = 'shader_read',

  /**
   * Resource has been disposed and should not be accessed.
   */
  Disposed = 'disposed',
}

/**
 * Result of a transition validation check.
 */
export interface TransitionValidation {
  /** Whether the transition is valid */
  valid: boolean

  /** Error message if invalid */
  error?: string
}


