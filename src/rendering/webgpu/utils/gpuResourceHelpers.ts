/**
 * GPU resource lifecycle helpers.
 *
 * Small utilities that reduce boilerplate in compute-pass dispose /
 * rebuild functions without adding abstraction.
 *
 * @module rendering/webgpu/utils/gpuResourceHelpers
 */

/**
 * Destroy multiple GPU resources, skipping null/undefined entries.
 * Variadic signature keeps call sites type-safe (each argument must be
 * GPUBuffer | GPUTexture | null | undefined) while eliminating per-line
 * `?.destroy()` boilerplate.
 */
export function destroyGpuResources(
  ...resources: ReadonlyArray<GPUBuffer | GPUTexture | null | undefined>
): void {
  for (const r of resources) r?.destroy()
}
