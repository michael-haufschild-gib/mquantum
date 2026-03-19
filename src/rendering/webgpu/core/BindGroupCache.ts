/**
 * Caches a GPUBindGroup and invalidates when reference-identity of cache keys changes.
 * Eliminates per-frame `device.createBindGroup()` calls when texture views are stable.
 *
 * @example
 * ```ts
 * private bgCache = new BindGroupCache()
 *
 * // In execute():
 * const bg = this.bgCache.get([colorView, depthView], () =>
 *   device.createBindGroup({ layout, entries: [...] })
 * )
 *
 * // In dispose():
 * this.bgCache.invalidate()
 * ```
 */
export class BindGroupCache {
  private bindGroup: GPUBindGroup | null = null
  private keys: unknown[] = []

  /**
   * Return cached bind group if keys match, otherwise call `create()`.
   * Keys are compared by reference identity (`===`).
   * Pass `[]` for keys that never change (create-once pattern).
   * @param keys - Reference-comparable cache keys (typically GPUTextureView/GPUTexture)
   * @param create - Factory called on cache miss
   * @returns The cached or newly created bind group
   */
  get(keys: unknown[], create: () => GPUBindGroup): GPUBindGroup {
    if (this.bindGroup && !this.keysChanged(keys)) {
      return this.bindGroup
    }
    this.bindGroup = create()
    this.keys = keys.slice()
    return this.bindGroup
  }

  /** Invalidate the cache. Call from `dispose()` or `releaseInternalResources()`. */
  invalidate(): void {
    this.bindGroup = null
    this.keys = []
  }

  private keysChanged(newKeys: unknown[]): boolean {
    if (newKeys.length !== this.keys.length) return true
    for (let i = 0; i < newKeys.length; i++) {
      if (newKeys[i] !== this.keys[i]) return true
    }
    return false
  }
}
