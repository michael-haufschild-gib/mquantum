/**
 * External Bridge
 *
 * Formalizes the contract between the render graph and external systems.
 * Handles importing external resources at frame start and exporting internal
 * resources at frame end.
 *
 * ## Problem Solved
 * React components set `scene.background` and `scene.environment` at arbitrary
 * times during the React lifecycle. The render graph needs these values frozen
 * at frame start, and may need to export its own computed values at frame end.
 *
 * ## Import Flow (Frame Start)
 * 1. Capture external resources before pass execution
 * 2. Passes read from imported values, not live scene properties
 *
 * ## Export Flow (Frame End)
 * 1. Passes register export intentions during execution
 * 2. After all passes complete, exports are applied to external targets
 *
 * @module rendering/graph/ExternalBridge
 */

import type * as THREE from 'three'

// =============================================================================
// External Resource IDs
// =============================================================================

/**
 * Known external resource identifiers.
 * These represent resources that live outside the render graph's control.
 */
export type ExternalResourceId =
  | 'scene.background'
  | 'scene.environment'
  | 'skybox.cubemap'
  | 'skybox.rotation'
  | string // Allow custom IDs

// =============================================================================
// Import Configuration
// =============================================================================

/**
 * Configuration for importing an external resource.
 */
export interface ImportConfig<T> {
  /** Unique identifier for this import */
  id: ExternalResourceId

  /** Function to capture the current value */
  getter: () => T

  /** Optional validator to check if value is usable */
  validator?: (value: T) => boolean
}

// =============================================================================
// Export Configuration
// =============================================================================

/**
 * Configuration for exporting a render graph resource to external systems.
 */
export interface ExportConfig<TInternal, TExternal = TInternal> {
  /** Unique identifier for this export */
  id: ExternalResourceId

  /** Internal resource ID in the render graph's resource pool */
  resourceId: string

  /** Function to apply the value to the external target */
  setter: (value: TExternal) => void

  /** Optional transform from internal to external format */
  transform?: (internal: TInternal) => TExternal
}

/**
 * A registered export with captured value.
 */
interface RegisteredExport<T = unknown> {
  /** Export configuration */
  config: ExportConfig<unknown, T>

  /** Value to be exported (set during pass execution) */
  value: T | null

  /** Whether this export is pending (value has been set) */
  pending: boolean
}

// =============================================================================
// Pending Export
// =============================================================================

/**
 * A pending export registration from a pass.
 * Passes use this lightweight interface to queue exports during execution.
 */
export interface PendingExport<T = unknown> {
  /** External resource ID to export to */
  id: ExternalResourceId

  /** The value to export */
  value: T
}

// =============================================================================
// External Bridge Class
// =============================================================================

/**
 * Manages the boundary between render graph and external systems.
 *
 * @example
 * ```typescript
 * const bridge = new ExternalBridge();
 *
 * // Setup imports (before frame)
 * bridge.registerImport({
 *   id: 'scene.background',
 *   getter: () => scene.background,
 *   validator: (bg) => bg instanceof THREE.CubeTexture
 * });
 *
 * // Setup exports
 * bridge.registerExport({
 *   id: 'skybox.cubemap',
 *   resourceId: 'skyCubeRT',
 *   setter: (texture) => { scene.background = texture; },
 *   transform: (rt) => rt.texture
 * });
 *
 * // Frame execution
 * bridge.captureImports();       // At frame start
 * // ... pass execution ...
 * bridge.queueExport({           // During pass
 *   id: 'skybox.cubemap',
 *   value: capturedCubemap
 * });
 * bridge.executeExports();       // At frame end
 * ```
 */
export class ExternalBridge {
  /** Registered import configurations */
  private imports = new Map<ExternalResourceId, ImportConfig<unknown>>()

  /** Captured import values for current frame */
  private capturedImports = new Map<ExternalResourceId, unknown>()

  /** Registered export configurations */
  private exports = new Map<ExternalResourceId, RegisteredExport>()

  /** Queued exports for current frame */
  private queuedExports = new Map<ExternalResourceId, PendingExport>()

  /** Whether imports have been captured this frame */
  private importsCaptured = false

  /** Debug name for logging */
  private debugName?: string

  /**
   * Create an external bridge.
   *
   * @param debugName - Optional name for debug logging
   */
  constructor(debugName?: string) {
    this.debugName = debugName
  }

  // ===========================================================================
  // Import Registration and Capture
  // ===========================================================================

  /**
   * Register an import configuration.
   *
   * @param config - Import configuration
   */
  registerImport<T>(config: ImportConfig<T>): void {
    this.imports.set(config.id, config as ImportConfig<unknown>)
  }

  /**
   * Unregister an import.
   *
   * @param id - Import ID to unregister
   */
  unregisterImport(id: ExternalResourceId): void {
    this.imports.delete(id)
    this.capturedImports.delete(id)
  }

  /**
   * Capture all registered imports.
   * Call this ONCE at the start of each frame.
   */
  captureImports(): void {
    this.capturedImports.clear()

    for (const [id, config] of this.imports) {
      try {
        const value = config.getter()

        // Apply validator if present
        if (config.validator) {
          if (config.validator(value)) {
            this.capturedImports.set(id, value)
          }
          // If validation fails, leave as uncaptured (null)
        } else {
          this.capturedImports.set(id, value)
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn(
            `[ExternalBridge${this.debugName ? `:${this.debugName}` : ''}] Failed to capture import '${id}':`,
            error
          )
        }
      }
    }

    this.importsCaptured = true
  }

  /**
   * Get an imported value.
   *
   * @param id - Import ID
   * @returns The captured value, or null if not captured or invalid
   */
  getImported<T>(id: ExternalResourceId): T | null {
    if (!this.importsCaptured) {
      if (import.meta.env.DEV) {
        console.warn(
          `[ExternalBridge${this.debugName ? `:${this.debugName}` : ''}] getImported called before captureImports for '${id}'`
        )
      }
    }

    const value = this.capturedImports.get(id)
    return (value as T) ?? null
  }

  /**
   * Check if an import is available.
   *
   * @param id - Import ID
   * @returns True if the import was captured and validated
   */
  hasImport(id: ExternalResourceId): boolean {
    return this.capturedImports.has(id)
  }

  // ===========================================================================
  // Export Registration and Execution
  // ===========================================================================

  /**
   * Register an export configuration.
   *
   * @param config - Export configuration
   */
  registerExport<TInternal, TExternal = TInternal>(
    config: ExportConfig<TInternal, TExternal>
  ): void {
    this.exports.set(config.id, {
      config: config as ExportConfig<unknown, unknown>,
      value: null,
      pending: false,
    })
  }

  /**
   * Unregister an export.
   *
   * @param id - Export ID to unregister
   */
  unregisterExport(id: ExternalResourceId): void {
    this.exports.delete(id)
    this.queuedExports.delete(id)
  }

  /**
   * Queue an export value during pass execution.
   * The value will be applied during executeExports().
   *
   * @param pending - The pending export to queue
   */
  queueExport<T>(pending: PendingExport<T>): void {
    this.queuedExports.set(pending.id, pending as PendingExport<unknown>)
  }

  /**
   * Execute all queued exports.
   * Call this ONCE at the end of each frame, after all passes complete.
   */
  executeExports(): void {
    for (const [id, pending] of this.queuedExports) {
      const registered = this.exports.get(id)

      if (!registered) {
        // Direct export without registration
        if (import.meta.env.DEV) {
          console.warn(
            `[ExternalBridge${this.debugName ? `:${this.debugName}` : ''}] Export '${id}' queued but not registered`
          )
        }
        continue
      }

      try {
        // Apply transform if present
        const value = registered.config.transform
          ? registered.config.transform(pending.value)
          : pending.value

        // Apply to external target
        registered.config.setter(value)
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error(
            `[ExternalBridge${this.debugName ? `:${this.debugName}` : ''}] Failed to execute export '${id}':`,
            error
          )
        }
      }
    }

    // Clear queued exports after execution
    this.queuedExports.clear()
  }

  /**
   * Check if an export is registered.
   *
   * @param id - Export ID
   * @returns True if the export is registered
   */
  hasExport(id: ExternalResourceId): boolean {
    return this.exports.has(id)
  }

  /**
   * Check if an export is queued for execution.
   *
   * @param id - Export ID
   * @returns True if the export has a pending value
   */
  isExportQueued(id: ExternalResourceId): boolean {
    return this.queuedExports.has(id)
  }

  // ===========================================================================
  // Frame Management
  // ===========================================================================

  /**
   * Begin a new frame.
   * Clears captured imports and queued exports.
   */
  beginFrame(): void {
    this.capturedImports.clear()
    this.queuedExports.clear()
    this.importsCaptured = false
  }

  /**
   * End the current frame.
   * Alias for executeExports().
   */
  endFrame(): void {
    this.executeExports()
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Clear all registrations and state.
   */
  reset(): void {
    this.imports.clear()
    this.exports.clear()
    this.capturedImports.clear()
    this.queuedExports.clear()
    this.importsCaptured = false
  }

  /**
   * Dispose the bridge.
   */
  dispose(): void {
    this.reset()
  }

  // ===========================================================================
  // Debug Utilities
  // ===========================================================================

  /**
   * Get debug info about current state.
   *
   * @returns Object with import/export state
   */
  getDebugInfo(): {
    imports: Array<{ id: ExternalResourceId; captured: boolean }>
    exports: Array<{ id: ExternalResourceId; queued: boolean }>
  } {
    const importInfo: Array<{ id: ExternalResourceId; captured: boolean }> = []
    for (const id of this.imports.keys()) {
      importInfo.push({ id, captured: this.capturedImports.has(id) })
    }

    const exportInfo: Array<{ id: ExternalResourceId; queued: boolean }> = []
    for (const id of this.exports.keys()) {
      exportInfo.push({ id, queued: this.queuedExports.has(id) })
    }

    return { imports: importInfo, exports: exportInfo }
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create an import config for scene.background.
 *
 * @param scene - The THREE.Scene to capture from
 * @returns Import configuration
 */
export function createSceneBackgroundImport(
  scene: THREE.Scene
): ImportConfig<THREE.Color | THREE.Texture | null> {
  return {
    id: 'scene.background',
    getter: () => scene.background,
  }
}

/**
 * Create an import config for scene.environment.
 *
 * @param scene - The THREE.Scene to capture from
 * @returns Import configuration
 */
export function createSceneEnvironmentImport(
  scene: THREE.Scene
): ImportConfig<THREE.Texture | null> {
  return {
    id: 'scene.environment',
    getter: () => scene.environment,
  }
}

/**
 * Create an export config for scene.background.
 *
 * @param scene - The THREE.Scene to export to
 * @returns Export configuration
 */
export function createSceneBackgroundExport(
  scene: THREE.Scene
): ExportConfig<THREE.Texture | THREE.Color | null> {
  return {
    id: 'scene.background',
    resourceId: '', // Not backed by a pool resource
    setter: (value) => {
      scene.background = value
    },
  }
}

/**
 * Create an export config for scene.environment.
 *
 * @param scene - The THREE.Scene to export to
 * @returns Export configuration
 */
export function createSceneEnvironmentExport(
  scene: THREE.Scene
): ExportConfig<THREE.Texture | null> {
  return {
    id: 'scene.environment',
    resourceId: '', // Not backed by a pool resource
    setter: (value) => {
      scene.environment = value
    },
  }
}
