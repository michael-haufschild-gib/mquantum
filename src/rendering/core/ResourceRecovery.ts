/**
 * ResourceRecovery - Coordinates GPU resource recovery after context loss.
 *
 * This module provides a centralized coordinator for reinitializing WebGL
 * resources after a context loss/restore event. Resources are registered
 * with priority values and reinitialized in order (lower priority first).
 *
 * Priority Order:
 * - 5:  WebGL State Reset
 * - 10: PostProcessing (creates render targets first)
 * - 20: Temporal Depth State (needs valid gl)
 * - 50: Scene Materials (shader recompilation)
 * - 60: Skybox PMREM Cache (expensive, can wait)
 *
 * @module rendering/core/ResourceRecovery
 */

import type * as THREE from 'three'
import { useMsgBoxStore } from '@/stores/msgBoxStore'

// ============================================================================
// Types
// ============================================================================

/**
 * Interface for resource managers that can be recovered.
 */
export interface ResourceManager {
  /** Unique identifier for this manager */
  name: string

  /**
   * Priority for recovery order (lower = first).
   * Use constants from RECOVERY_PRIORITY for consistency.
   */
  priority: number

  /**
   * Invalidate all GPU resources.
   * Called synchronously before any reinitialize calls.
   * Should null texture refs in uniforms and dispose targets.
   */
  invalidate: () => void

  /**
   * Reinitialize GPU resources.
   * Called asynchronously in priority order after all invalidate calls.
   * @param gl - The WebGL renderer (freshly restored)
   */
  reinitialize: (gl: THREE.WebGLRenderer) => Promise<void>
}

/**
 * Event types emitted by the recovery coordinator.
 */
export type RecoveryEvent =
  | { type: 'invalidating' }
  | { type: 'invalidated' }
  | { type: 'reinitializing'; manager: string; progress: number }
  | { type: 'reinitialized'; manager: string }
  | { type: 'complete' }
  | { type: 'error'; manager: string; error: Error }

/**
 * Event listener for recovery events.
 */
export type RecoveryEventListener = (event: RecoveryEvent) => void

// ============================================================================
// Constants
// ============================================================================

/**
 * Standard priority values for resource recovery.
 * Use these constants when registering resource managers.
 */
export const RECOVERY_PRIORITY = {
  WEBGL_STATE: 5,
  POST_PROCESSING: 10,
  TEMPORAL_DEPTH: 20,
  SCENE_MATERIALS: 50,
  SKYBOX_PMREM: 60,
} as const

// ============================================================================
// ResourceRecoveryCoordinator Class
// ============================================================================

/**
 * Singleton coordinator for GPU resource recovery.
 */
class ResourceRecoveryCoordinator {
  private managers: Map<string, ResourceManager> = new Map()
  private listeners: Set<RecoveryEventListener> = new Set()
  private isRecovering = false

  /**
   * Register a resource manager for recovery.
   * @param manager - The resource manager to register
   */
  register(manager: ResourceManager): void {
    if (this.managers.has(manager.name)) {
      console.warn(`[ResourceRecovery] Manager "${manager.name}" already registered, replacing`)
    }
    this.managers.set(manager.name, manager)
  }

  /**
   * Check if a resource manager is already registered.
   * @param name - The name of the manager to check
   * @returns true if the manager is registered
   */
  has(name: string): boolean {
    return this.managers.has(name)
  }

  /**
   * Unregister a resource manager.
   * @param name - The name of the manager to unregister
   */
  unregister(name: string): void {
    this.managers.delete(name)
  }

  /**
   * Add an event listener for recovery events.
   * @param listener - The listener to add
   * @returns Unsubscribe function
   */
  addListener(listener: RecoveryEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Emit an event to all listeners.
   * @param event - The event to emit
   */
  private emit(event: RecoveryEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event)
      } catch (e) {
        console.error('[ResourceRecovery] Event listener error:', e)
      }
    })
  }

  /**
   * Recover all registered resources.
   *
   * Process:
   * 1. Invalidate all resources (synchronous, parallel)
   * 2. Reinitialize in priority order (sequential, async)
   *
   * @param gl - The WebGL renderer (freshly restored context)
   * @throws If any critical manager fails to reinitialize
   */
  async recover(gl: THREE.WebGLRenderer): Promise<void> {
    if (this.isRecovering) {
      console.warn('[ResourceRecovery] Recovery already in progress, skipping')
      return
    }

    this.isRecovering = true

    try {
      // Phase 1: Invalidate all resources synchronously
      this.emit({ type: 'invalidating' })

      for (const manager of this.managers.values()) {
        try {
          manager.invalidate()
        } catch (e) {
          console.error(`[ResourceRecovery] Failed to invalidate "${manager.name}":`, e)
        }
      }

      this.emit({ type: 'invalidated' })

      // Phase 2: Reinitialize in priority order
      const sorted = [...this.managers.values()].sort((a, b) => a.priority - b.priority)

      const total = sorted.length
      let completed = 0

      for (const manager of sorted) {
        this.emit({
          type: 'reinitializing',
          manager: manager.name,
          progress: completed / total,
        })

        try {
          await manager.reinitialize(gl)
          this.emit({ type: 'reinitialized', manager: manager.name })
        } catch (e) {
          const error = e instanceof Error ? e : new Error(String(e))
          this.emit({ type: 'error', manager: manager.name, error })
          console.error(`[ResourceRecovery] Failed to reinitialize "${manager.name}":`, e)

          useMsgBoxStore
            .getState()
            .showMsgBox(
              'Recovery Error',
              `Failed to restore GPU resources for: ${manager.name}. The application may be unstable.\n\nDetails: ${error.message}`,
              'warning'
            )
          // Continue with other managers - partial recovery is better than none
        }

        completed++
      }

      this.emit({ type: 'complete' })
    } finally {
      this.isRecovering = false
    }
  }

  /**
   * Check if recovery is currently in progress.
   * @returns True if recovery is in progress
   */
  isInProgress(): boolean {
    return this.isRecovering
  }

  /**
   * Get list of registered manager names.
   * @returns Array of registered manager names
   */
  getRegisteredManagers(): string[] {
    return [...this.managers.keys()]
  }

  /**
   * Clear all registered managers.
   * Primarily for testing purposes.
   */
  clear(): void {
    this.managers.clear()
    this.listeners.clear()
    this.isRecovering = false
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * Global resource recovery coordinator singleton.
 * Use this instance to register/unregister resource managers.
 */
export const resourceRecovery = new ResourceRecoveryCoordinator()
