/**
 * External Resource Registry
 *
 * Captures external resources (scene.background, scene.environment, etc.) once at
 * frame start so passes read consistent values throughout the frame.
 *
 * This solves the race condition where React/external code can modify these values
 * mid-frame, causing passes to see inconsistent state.
 *
 * ## Industry Pattern
 * Based on Unreal RDG's RegisterExternal() and Frostbite's external resource import.
 * The key insight: external resources are CAPTURED at frame start and FROZEN during execute.
 *
 * @module rendering/graph/ExternalResourceRegistry
 */

/**
 * Configuration for an external resource.
 */
export interface ExternalResourceConfig<T> {
  /** Unique identifier for this resource */
  id: string

  /** Function to get the current value */
  getter: () => T

  /** Optional validation function */
  validator?: (value: T) => boolean

  /** Human-readable description for debugging */
  description?: string
}

/**
 * Internal entry for a captured resource.
 */
interface CapturedResource<T> {
  config: ExternalResourceConfig<T>
  capturedValue: T | null
  capturedFrame: number
  valid: boolean
}

/**
 * Registry for external resources that exist outside the render graph.
 *
 * External resources are:
 * - scene.background / scene.environment (Three.js scene state)
 * - Store values that passes need to read
 * - Any state that can be modified outside the render graph
 *
 * ## Usage
 * ```typescript
 * const registry = new ExternalResourceRegistry();
 *
 * // Register at graph setup
 * registry.register({
 *   id: 'scene.background',
 *   getter: () => scene.background,
 *   description: 'Scene background texture for skybox'
 * });
 *
 * // Capture all at frame start (in execute())
 * registry.captureAll();
 *
 * // Passes read frozen values
 * const background = registry.get<THREE.Texture>('scene.background');
 * ```
 */
export class ExternalResourceRegistry {
  /** Map of registered resources by ID */
  private resources = new Map<string, CapturedResource<unknown>>()

  /** Current frame number */
  private currentFrame = 0

  /** Whether captures have been taken this frame */
  private capturedThisFrame = false

  // ==========================================================================
  // Registration
  // ==========================================================================

  /**
   * Register an external resource.
   *
   * @param config - Resource configuration
   */
  register<T>(config: ExternalResourceConfig<T>): void {
    if (this.resources.has(config.id)) {
      console.warn(
        `ExternalResourceRegistry: Resource '${config.id}' already registered, replacing`
      )
    }

    this.resources.set(config.id, {
      config: config as ExternalResourceConfig<unknown>,
      capturedValue: null,
      capturedFrame: -1,
      valid: false,
    })
  }

  /**
   * Unregister an external resource.
   *
   * @param id - Resource identifier
   */
  unregister(id: string): void {
    this.resources.delete(id)
  }

  /**
   * Check if a resource is registered.
   *
   * @param id - Resource identifier
   * @returns True if the resource is registered
   */
  has(id: string): boolean {
    return this.resources.has(id)
  }

  // ==========================================================================
  // Capture
  // ==========================================================================

  /**
   * Capture all registered resources.
   *
   * CRITICAL: Call this ONCE at frame start, BEFORE any passes execute.
   * This freezes external state for the duration of the frame.
   */
  captureAll(): void {
    for (const entry of this.resources.values()) {
      this.captureResource(entry)
    }
    this.capturedThisFrame = true
  }

  /**
   * Capture a single resource.
   * @param entry - The resource entry to capture
   */
  private captureResource(entry: CapturedResource<unknown>): void {
    try {
      const value = entry.config.getter()

      // Run validation if provided
      if (entry.config.validator && !entry.config.validator(value)) {
        entry.capturedValue = null
        entry.valid = false
        entry.capturedFrame = this.currentFrame
        return
      }

      entry.capturedValue = value
      entry.valid = true
      entry.capturedFrame = this.currentFrame
    } catch (error) {
      console.error(`ExternalResourceRegistry: Failed to capture '${entry.config.id}':`, error)
      entry.capturedValue = null
      entry.valid = false
      entry.capturedFrame = this.currentFrame
    }
  }

  // ==========================================================================
  // Access
  // ==========================================================================

  /**
   * Get a captured resource value.
   *
   * @param id - Resource identifier
   * @returns The captured value or null if not found/invalid
   */
  get<T>(id: string): T | null {
    const entry = this.resources.get(id)
    if (!entry) {
      if (import.meta.env.DEV) {
        console.warn(`ExternalResourceRegistry: Resource '${id}' not registered`)
      }
      return null
    }

    // Warn if reading stale capture (different frame)
    if (entry.capturedFrame !== this.currentFrame) {
      if (import.meta.env.DEV) {
        console.warn(
          `ExternalResourceRegistry: Resource '${id}' was captured in frame ${entry.capturedFrame}, ` +
            `but current frame is ${this.currentFrame}. Call captureAll() first.`
        )
      }
    }

    if (!entry.valid) {
      return null
    }

    return entry.capturedValue as T
  }

  /**
   * Check if a resource was successfully captured this frame.
   *
   * @param id - Resource identifier
   * @returns True if the resource was successfully captured
   */
  isCaptured(id: string): boolean {
    const entry = this.resources.get(id)
    return entry?.valid === true && entry.capturedFrame === this.currentFrame
  }

  /**
   * Check if any capture has happened this frame.
   * @returns True if capture has happened this frame
   */
  hasCapturedThisFrame(): boolean {
    return this.capturedThisFrame
  }

  // ==========================================================================
  // Frame Management
  // ==========================================================================

  /**
   * Advance to the next frame.
   *
   * Call this at the end of each frame to reset capture state.
   */
  advanceFrame(): void {
    this.currentFrame++
    this.capturedThisFrame = false
  }

  /**
   * Get the current frame number.
   * @returns The current frame number
   */
  getCurrentFrame(): number {
    return this.currentFrame
  }

  // ==========================================================================
  // Debugging
  // ==========================================================================

  /**
   * Get debug information about registered resources.
   * @returns Debug information string
   */
  getDebugInfo(): string {
    const lines: string[] = ['External Resources:']

    for (const [id, entry] of this.resources) {
      const status = entry.valid ? 'valid' : 'invalid'
      const frame =
        entry.capturedFrame === this.currentFrame ? 'current' : `frame ${entry.capturedFrame}`
      const desc = entry.config.description ?? 'no description'
      lines.push(`  ${id}: ${status} (${frame}) - ${desc}`)
    }

    return lines.join('\n')
  }

  /**
   * Get list of registered resource IDs.
   * @returns Array of registered resource IDs
   */
  getResourceIds(): string[] {
    return Array.from(this.resources.keys())
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Dispose all resources and clear registrations.
   */
  dispose(): void {
    this.resources.clear()
    this.currentFrame = 0
    this.capturedThisFrame = false
  }

  /**
   * Clear all captured values (but keep registrations).
   *
   * Useful for context loss recovery.
   */
  invalidateCaptures(): void {
    for (const entry of this.resources.values()) {
      entry.capturedValue = null
      entry.valid = false
      entry.capturedFrame = -1
    }
    this.capturedThisFrame = false
  }
}
