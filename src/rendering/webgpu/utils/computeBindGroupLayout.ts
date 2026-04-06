/**
 * Helper for creating compute-pipeline bind group layouts.
 *
 * Eliminates boilerplate: every compute BGL entry uses `GPUShaderStage.COMPUTE`
 * visibility and buffer bindings with sequential binding indices. This helper
 * collapses the per-entry object into a flat array of buffer types.
 *
 * @module rendering/webgpu/utils/computeBindGroupLayout
 */

/**
 * Create a `GPUBindGroupLayout` for a compute pipeline with buffer-only entries.
 *
 * Binding indices are assigned sequentially starting from 0. All entries use
 * `GPUShaderStage.COMPUTE` visibility.
 *
 * @param device - GPU device
 * @param label - Descriptive label for the layout (also used for GPU debugging)
 * @param bufferTypes - Buffer binding type for each entry, in binding order
 * @returns The created bind group layout
 *
 * @example
 * ```ts
 * // Before: 7 lines
 * const bgl = device.createBindGroupLayout({
 *   label: 'obs-pos-reduce-bgl',
 *   entries: [
 *     { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
 *     { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
 *     { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
 *   ],
 * })
 *
 * // After: 1 line
 * const bgl = createComputeBGL(device, 'obs-pos-reduce-bgl', ['uniform', 'read-only-storage', 'storage'])
 * ```
 */
export function createComputeBGL(
  device: GPUDevice,
  label: string,
  bufferTypes: GPUBufferBindingType[]
): GPUBindGroupLayout {
  return device.createBindGroupLayout({
    label,
    entries: bufferTypes.map((type, i) => ({
      binding: i,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type },
    })),
  })
}
