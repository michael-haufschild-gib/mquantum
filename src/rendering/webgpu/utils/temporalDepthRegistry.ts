/**
 * Global registry for temporal depth pass invalidation.
 *
 * Extracted to a utility module so that stores can call invalidation
 * without importing the full render-passes barrel (which would create
 * a circular chunk dependency: stores → render-passes → stores).
 *
 * @module rendering/webgpu/utils/temporalDepthRegistry
 */

/** Interface for objects that support temporal depth invalidation. */
interface Invalidatable {
  invalidate(): void
}

/** Registry of all active TemporalDepthCapturePass instances. */
const instanceRegistry = new Set<Invalidatable>()

/**
 * Register a temporal depth pass instance for global invalidation.
 * @param instance - Pass instance with an invalidate() method
 */
export function registerTemporalDepthPass(instance: Invalidatable): void {
  instanceRegistry.add(instance)
}

/**
 * Unregister a temporal depth pass instance.
 * @param instance - Pass instance to remove
 */
export function unregisterTemporalDepthPass(instance: Invalidatable): void {
  instanceRegistry.delete(instance)
}

/**
 * Invalidate all registered WebGPU TemporalDepthCapturePass instances.
 * Called when global state changes require resetting temporal data.
 */
export function invalidateAllTemporalDepthWebGPU(): void {
  instanceRegistry.forEach((instance) => {
    instance.invalidate()
  })
}
