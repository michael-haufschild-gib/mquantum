/**
 * Uniform Manager - Central registry for uniform sources.
 *
 * The UniformManager provides a centralized way to manage uniform sources
 * and efficiently apply them to materials. It tracks version numbers to
 * prevent redundant uniform updates.
 *
 * @module rendering/uniforms/UniformManager
 */

import type * as THREE from 'three'
import type { UniformSource, UniformUpdateState } from './UniformSource'

/**
 * Singleton manager for uniform sources.
 *
 * Provides registration, update, and application of uniform sources
 * with efficient change detection via version tracking.
 *
 * @example
 * ```typescript
 * // Register sources (typically done once at startup)
 * UniformManager.register(new LightingSource());
 * UniformManager.register(new TemporalSource());
 *
 * // In useFrame callback:
 * UniformManager.update({ time, delta, camera, size });
 *
 * // Apply to material (only updates changed uniforms)
 * UniformManager.applyToMaterial(material, ['lighting', 'temporal']);
 * ```
 */
class UniformManagerClass {
  private sources = new Map<string, UniformSource>()
  private materialVersionCache = new WeakMap<THREE.ShaderMaterial, Map<string, number>>()

  /**
   * Register a uniform source.
   *
   * @param source - The uniform source to register
   * @throws Error if a source with the same ID is already registered
   */
  register(source: UniformSource): void {
    if (this.sources.has(source.id)) {
      console.warn(`UniformManager: Replacing existing source '${source.id}'`)
    }
    this.sources.set(source.id, source)
  }

  /**
   * Unregister a uniform source.
   *
   * @param sourceId - The ID of the source to unregister
   * @returns true if the source was found and removed
   */
  unregister(sourceId: string): boolean {
    return this.sources.delete(sourceId)
  }

  /**
   * Get a registered uniform source by ID.
   *
   * @param sourceId - The ID of the source to get
   * @returns The uniform source, or undefined if not found
   */
  getSource(sourceId: string): UniformSource | undefined {
    return this.sources.get(sourceId)
  }

  /**
   * Check if a source is registered.
   *
   * @param sourceId - The ID of the source to check
   * @returns true if the source is registered
   */
  hasSource(sourceId: string): boolean {
    return this.sources.has(sourceId)
  }

  /**
   * Update all registered uniform sources.
   *
   * Should be called once per frame before applying uniforms to materials.
   *
   * @param state - Current frame state
   */
  update(state: UniformUpdateState): void {
    for (const source of this.sources.values()) {
      source.update(state)
    }
  }

  /**
   * Update specific uniform sources by ID.
   *
   * @param sourceIds - IDs of sources to update
   * @param state - Current frame state
   */
  updateSources(sourceIds: string[], state: UniformUpdateState): void {
    for (const id of sourceIds) {
      const source = this.sources.get(id)
      if (source) {
        source.update(state)
      }
    }
  }

  /**
   * Check if any of the specified sources have changed since last applied.
   *
   * @param material - The material to check against
   * @param sourceIds - IDs of sources to check
   * @returns true if any source has changed
   */
  hasChanges(material: THREE.ShaderMaterial, sourceIds: string[]): boolean {
    const cache = this.materialVersionCache.get(material)
    if (!cache) {
      return true // Never applied, so definitely has changes
    }

    for (const id of sourceIds) {
      const source = this.sources.get(id)
      if (!source) continue

      const cachedVersion = cache.get(id)
      if (cachedVersion === undefined || cachedVersion !== source.version) {
        return true
      }
    }

    return false
  }

  /**
   * Apply uniform sources to a material.
   *
   * Only applies uniforms from sources that have changed since the last
   * application to this material.
   *
   * @param material - The shader material to apply uniforms to
   * @param sourceIds - IDs of sources to apply
   * @param force - If true, apply all uniforms regardless of version
   */
  applyToMaterial(material: THREE.ShaderMaterial, sourceIds: string[], force = false): void {
    // Get or create version cache for this material
    let cache = this.materialVersionCache.get(material)
    if (!cache) {
      cache = new Map()
      this.materialVersionCache.set(material, cache)
    }

    for (const id of sourceIds) {
      const source = this.sources.get(id)
      if (!source) {
        console.warn(`UniformManager: Source '${id}' not found`)
        continue
      }

      const cachedVersion = cache.get(id)
      if (!force && cachedVersion === source.version) {
        continue // Skip - no changes
      }

      // Apply uniforms
      source.applyToMaterial(material)

      // Update cache
      cache.set(id, source.version)
    }
  }

  /**
   * Get the combined uniforms from multiple sources.
   *
   * Useful for creating initial uniform objects for materials.
   *
   * @param sourceIds - IDs of sources to get uniforms from
   * @returns Combined uniform record
   */
  getCombinedUniforms(sourceIds: string[]): Record<string, { value: unknown }> {
    const result: Record<string, { value: unknown }> = {}

    for (const id of sourceIds) {
      const source = this.sources.get(id)
      if (source) {
        Object.assign(result, source.getUniforms())
      }
    }

    return result
  }

  /**
   * Clear the version cache for a specific material.
   *
   * Call this when a material is recreated to force re-application
   * of all uniforms.
   *
   * @param material - The material to clear cache for
   */
  clearMaterialCache(material: THREE.ShaderMaterial): void {
    this.materialVersionCache.delete(material)
  }

  /**
   * Clear all caches.
   *
   * Useful for debugging or when resetting the renderer.
   */
  clearAllCaches(): void {
    // WeakMap entries are automatically cleared when materials are GC'd
    // Just create a new WeakMap to clear everything
    this.materialVersionCache = new WeakMap()
  }

  /**
   * Get all registered source IDs.
   *
   * @returns Array of registered source IDs
   */
  getRegisteredSources(): string[] {
    return Array.from(this.sources.keys())
  }

  /**
   * Reset the manager to initial state.
   *
   * Clears all registered sources and caches.
   * Primarily used for testing.
   */
  reset(): void {
    this.sources.clear()
    this.materialVersionCache = new WeakMap()
  }
}

/**
 * Singleton instance of the UniformManager.
 */
export const UniformManager = new UniformManagerClass()
