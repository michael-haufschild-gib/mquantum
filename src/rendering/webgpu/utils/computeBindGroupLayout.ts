/**
 * Helper for creating compute-pipeline bind group layouts.
 *
 * Eliminates boilerplate: every compute BGL entry uses `GPUShaderStage.COMPUTE`
 * visibility with sequential binding indices. Supports both buffer entries
 * (specified as strings) and storage texture entries (specified as objects).
 *
 * @module rendering/webgpu/utils/computeBindGroupLayout
 */

/** Storage texture entry descriptor for {@link createComputeBGL}. */
export interface ComputeStorageTextureEntry {
  storageTexture: {
    format: GPUTextureFormat
    viewDimension: GPUTextureViewDimension
    access?: 'write-only'
  }
}

/** A single entry in a compute bind group layout: buffer type string or storage texture object. */
export type ComputeBGLEntry = GPUBufferBindingType | ComputeStorageTextureEntry

/**
 * Create a `GPUBindGroupLayout` for a compute pipeline.
 *
 * Binding indices are assigned sequentially starting from 0. All entries use
 * `GPUShaderStage.COMPUTE` visibility.
 *
 * @param device - GPU device
 * @param label - Descriptive label for the layout (also used for GPU debugging)
 * @param entries - Buffer types (strings) or storage texture descriptors, in binding order
 * @returns The created bind group layout
 *
 * @example
 * ```ts
 * // Buffer-only (unchanged from original API):
 * const bgl = createComputeBGL(device, 'reduce-bgl', ['uniform', 'read-only-storage', 'storage'])
 *
 * // Mixed buffer + storage texture:
 * const bgl = createComputeBGL(device, 'write-grid-bgl', [
 *   'uniform',
 *   'read-only-storage',
 *   { storageTexture: { format: 'rgba16float', viewDimension: '3d' } },
 * ])
 * ```
 */
export function createComputeBGL(
  device: GPUDevice,
  label: string,
  entries: ComputeBGLEntry[]
): GPUBindGroupLayout {
  return device.createBindGroupLayout({
    label,
    entries: entries.map((entry, i) => {
      const base = { binding: i, visibility: GPUShaderStage.COMPUTE }
      if (typeof entry === 'string') {
        return { ...base, buffer: { type: entry } }
      }
      return { ...base, storageTexture: { access: 'write-only' as const, ...entry.storageTexture } }
    }),
  })
}
