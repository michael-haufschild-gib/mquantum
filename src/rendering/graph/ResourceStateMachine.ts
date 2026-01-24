/**
 * Resource State Machine
 *
 * Tracks resource states (Created → Write → Read) and validates transitions.
 * Ensures resources follow proper lifecycle and prevents invalid access patterns
 * like reading from a resource that hasn't been written to.
 *
 * ## Industry Pattern
 * Based on Vulkan's resource state tracking and D3D12's barrier system.
 * Resources must follow specific state transitions to ensure data hazard-free
 * execution.
 *
 * ## State Transitions
 * ```
 *   Created ──────► WriteTarget ──────► ShaderRead
 *      │               │ ▲                │
 *      │               │ │                │
 *      └───────────────┴─┴────────────────┴──► Disposed
 * ```
 *
 * @module rendering/graph/ResourceStateMachine
 */

// =============================================================================
// Resource States
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

// =============================================================================
// State Tracking
// =============================================================================

/**
 * Information about a resource's current state.
 */
interface ResourceStateInfo {
  /** Current state of the resource */
  state: ResourceState

  /** ID of the pass that last modified the state */
  lastModifiedBy: string | null

  /** Frame number when the state was last modified */
  lastModifiedFrame: number

  /** History of state transitions for debugging */
  history: Array<{
    fromState: ResourceState
    toState: ResourceState
    passId: string
    frame: number
  }>
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

// =============================================================================
// Valid Transitions Matrix
// =============================================================================

/**
 * Valid state transitions.
 * Key: current state
 * Value: array of valid next states
 */
const VALID_TRANSITIONS: Record<ResourceState, ResourceState[]> = {
  [ResourceState.Created]: [ResourceState.WriteTarget, ResourceState.Disposed],
  [ResourceState.WriteTarget]: [
    ResourceState.ShaderRead,
    ResourceState.WriteTarget,
    ResourceState.Disposed,
  ],
  [ResourceState.ShaderRead]: [
    ResourceState.WriteTarget,
    ResourceState.ShaderRead,
    ResourceState.Disposed,
  ],
  [ResourceState.Disposed]: [], // No valid transitions from disposed
}

// =============================================================================
// Resource State Machine Class
// =============================================================================

/**
 * Manages resource state transitions and validates access patterns.
 *
 * @example
 * ```typescript
 * const stateMachine = new ResourceStateMachine();
 *
 * // Register resource
 * stateMachine.register('colorBuffer');
 *
 * // Before rendering to resource
 * const validation = stateMachine.validateTransition('colorBuffer', ResourceState.WriteTarget);
 * if (validation.valid) {
 *   stateMachine.transition('colorBuffer', ResourceState.WriteTarget, 'scenePass');
 *   // Render...
 * }
 *
 * // After rendering, transition to readable
 * stateMachine.transition('colorBuffer', ResourceState.ShaderRead, 'scenePass');
 *
 * // Another pass wants to read
 * if (stateMachine.canRead('colorBuffer')) {
 *   // Sample from texture...
 * }
 * ```
 */
export class ResourceStateMachine {
  /** State tracking for each resource */
  private resources = new Map<string, ResourceStateInfo>()

  /** Current frame number */
  private frameNumber = 0

  /** Whether to keep transition history (for debugging) */
  private keepHistory: boolean

  /** Maximum history entries per resource */
  private maxHistorySize: number

  /**
   * Create a resource state machine.
   *
   * @param options - Configuration options
   * @param options.keepHistory - Whether to track transition history (default: true in dev)
   * @param options.maxHistorySize - Maximum history entries per resource (default: 100)
   */
  constructor(options?: { keepHistory?: boolean; maxHistorySize?: number }) {
    this.keepHistory = options?.keepHistory ?? import.meta.env.DEV
    this.maxHistorySize = options?.maxHistorySize ?? 100
  }

  // ===========================================================================
  // Registration
  // ===========================================================================

  /**
   * Register a new resource with the state machine.
   *
   * @param resourceId - Unique identifier for the resource
   * @throws Error if resource is already registered
   */
  register(resourceId: string): void {
    if (this.resources.has(resourceId)) {
      throw new Error(`ResourceStateMachine: Resource '${resourceId}' is already registered`)
    }

    this.resources.set(resourceId, {
      state: ResourceState.Created,
      lastModifiedBy: null,
      lastModifiedFrame: this.frameNumber,
      history: [],
    })
  }

  /**
   * Unregister a resource from the state machine.
   *
   * @param resourceId - Unique identifier for the resource
   */
  unregister(resourceId: string): void {
    const info = this.resources.get(resourceId)
    if (info && info.state !== ResourceState.Disposed) {
      // Transition to disposed before removing
      this.transition(resourceId, ResourceState.Disposed, 'unregister')
    }
    this.resources.delete(resourceId)
  }

  /**
   * Check if a resource is registered.
   *
   * @param resourceId - Unique identifier for the resource
   * @returns True if the resource is registered
   */
  isRegistered(resourceId: string): boolean {
    return this.resources.has(resourceId)
  }

  // ===========================================================================
  // State Query
  // ===========================================================================

  /**
   * Get the current state of a resource.
   *
   * @param resourceId - Unique identifier for the resource
   * @returns The current state, or undefined if not registered
   */
  getState(resourceId: string): ResourceState | undefined {
    return this.resources.get(resourceId)?.state
  }

  /**
   * Get full state info for a resource.
   *
   * @param resourceId - Unique identifier for the resource
   * @returns State info including history, or undefined if not registered
   */
  getStateInfo(resourceId: string): Readonly<ResourceStateInfo> | undefined {
    return this.resources.get(resourceId)
  }

  /**
   * Check if a resource can be read from (sampled in a shader).
   *
   * A resource can be read if it's in ShaderRead state.
   *
   * @param resourceId - Unique identifier for the resource
   * @returns True if the resource can be read
   */
  canRead(resourceId: string): boolean {
    const state = this.getState(resourceId)
    return state === ResourceState.ShaderRead
  }

  /**
   * Check if a resource can be written to (bound as render target).
   *
   * A resource can be written if it's in Created, WriteTarget, or ShaderRead state.
   *
   * @param resourceId - Unique identifier for the resource
   * @returns True if the resource can be written
   */
  canWrite(resourceId: string): boolean {
    const state = this.getState(resourceId)
    return (
      state === ResourceState.Created ||
      state === ResourceState.WriteTarget ||
      state === ResourceState.ShaderRead
    )
  }

  // ===========================================================================
  // Transitions
  // ===========================================================================

  /**
   * Validate whether a state transition is allowed.
   *
   * @param resourceId - Unique identifier for the resource
   * @param toState - Target state
   * @returns Validation result with error message if invalid
   */
  validateTransition(resourceId: string, toState: ResourceState): TransitionValidation {
    const info = this.resources.get(resourceId)

    if (!info) {
      return {
        valid: false,
        error: `Resource '${resourceId}' is not registered`,
      }
    }

    const currentState = info.state

    if (currentState === ResourceState.Disposed) {
      return {
        valid: false,
        error: `Resource '${resourceId}' has been disposed and cannot transition`,
      }
    }

    const validNextStates = VALID_TRANSITIONS[currentState]
    if (!validNextStates.includes(toState)) {
      return {
        valid: false,
        error: `Invalid transition for '${resourceId}': ${currentState} → ${toState}. Valid transitions: ${validNextStates.join(', ') || 'none'}`,
      }
    }

    return { valid: true }
  }

  /**
   * Transition a resource to a new state.
   *
   * @param resourceId - Unique identifier for the resource
   * @param toState - Target state
   * @param passId - ID of the pass performing the transition
   * @throws Error if the transition is invalid
   */
  transition(resourceId: string, toState: ResourceState, passId: string): void {
    const validation = this.validateTransition(resourceId, toState)
    if (!validation.valid) {
      throw new Error(`ResourceStateMachine: ${validation.error}`)
    }

    const info = this.resources.get(resourceId)!
    const fromState = info.state

    // Record history if enabled
    if (this.keepHistory) {
      info.history.push({
        fromState,
        toState,
        passId,
        frame: this.frameNumber,
      })

      // Trim history if too large
      if (info.history.length > this.maxHistorySize) {
        info.history.shift()
      }
    }

    // Update state
    info.state = toState
    info.lastModifiedBy = passId
    info.lastModifiedFrame = this.frameNumber
  }

  // ===========================================================================
  // Frame Management
  // ===========================================================================

  /**
   * Begin a new frame.
   *
   * Resets all non-disposed resources to Created state for the new frame.
   * This implements the "transient" resource model where resources are
   * re-validated each frame.
   */
  beginFrame(): void {
    this.frameNumber++

    for (const [_resourceId, info] of this.resources) {
      if (info.state !== ResourceState.Disposed) {
        // Reset to created state for new frame
        const previousState = info.state
        if (previousState !== ResourceState.Created) {
          if (this.keepHistory) {
            info.history.push({
              fromState: previousState,
              toState: ResourceState.Created,
              passId: 'frame_reset',
              frame: this.frameNumber,
            })

            if (info.history.length > this.maxHistorySize) {
              info.history.shift()
            }
          }

          info.state = ResourceState.Created
          info.lastModifiedBy = 'frame_reset'
          info.lastModifiedFrame = this.frameNumber
        }
      }
    }
  }

  /**
   * Get the current frame number.
   * @returns Current frame number
   */
  getFrameNumber(): number {
    return this.frameNumber
  }

  // ===========================================================================
  // Bulk Operations
  // ===========================================================================

  /**
   * Get all resources in a specific state.
   *
   * @param state - The state to filter by
   * @returns Array of resource IDs in the specified state
   */
  getResourcesInState(state: ResourceState): string[] {
    const result: string[] = []
    for (const [resourceId, info] of this.resources) {
      if (info.state === state) {
        result.push(resourceId)
      }
    }
    return result
  }

  /**
   * Get all registered resource IDs.
   *
   * @returns Array of all resource IDs
   */
  getAllResourceIds(): string[] {
    return Array.from(this.resources.keys())
  }

  // ===========================================================================
  // Validation Utilities
  // ===========================================================================

  /**
   * Validate that a resource has been written to before being read.
   * This is a compile-time validation helper.
   *
   * @param resourceId - Unique identifier for the resource
   * @param readerPassId - ID of the pass that wants to read
   * @returns Validation result
   */
  validateReadAfterWrite(resourceId: string, readerPassId: string): TransitionValidation {
    const info = this.resources.get(resourceId)

    if (!info) {
      return {
        valid: false,
        error: `Resource '${resourceId}' is not registered (reader: ${readerPassId})`,
      }
    }

    if (info.state === ResourceState.Created) {
      return {
        valid: false,
        error: `Resource '${resourceId}' is read by '${readerPassId}' but has not been written to this frame`,
      }
    }

    if (info.state === ResourceState.WriteTarget) {
      return {
        valid: false,
        error: `Resource '${resourceId}' is read by '${readerPassId}' but is still being written to`,
      }
    }

    if (info.state === ResourceState.Disposed) {
      return {
        valid: false,
        error: `Resource '${resourceId}' is read by '${readerPassId}' but has been disposed`,
      }
    }

    return { valid: true }
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Reset all state, unregistering all resources.
   */
  reset(): void {
    this.resources.clear()
    this.frameNumber = 0
  }

  /**
   * Dispose all resources and reset state.
   */
  dispose(): void {
    // Transition all resources to disposed
    for (const resourceId of this.resources.keys()) {
      const info = this.resources.get(resourceId)
      if (info && info.state !== ResourceState.Disposed) {
        info.state = ResourceState.Disposed
        info.lastModifiedBy = 'dispose'
        info.lastModifiedFrame = this.frameNumber
      }
    }

    this.reset()
  }

  // ===========================================================================
  // Debug Utilities
  // ===========================================================================

  /**
   * Get a debug snapshot of all resource states.
   *
   * @returns Object mapping resource IDs to their states
   */
  getDebugSnapshot(): Record<string, { state: string; lastModifiedBy: string | null }> {
    const result: Record<string, { state: string; lastModifiedBy: string | null }> = {}

    for (const [resourceId, info] of this.resources) {
      result[resourceId] = {
        state: info.state,
        lastModifiedBy: info.lastModifiedBy,
      }
    }

    return result
  }
}
