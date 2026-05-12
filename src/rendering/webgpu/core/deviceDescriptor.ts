/**
 * Shared WebGPU device request descriptor.
 *
 * The support probe and production renderer must request the same optional
 * features/limits, otherwise the app can report WebGPU support and then fail
 * on the real canvas initialization path.
 */

const OPTIONAL_DEVICE_FEATURES: readonly GPUFeatureName[] = [
  'timestamp-query',
  'texture-compression-bc',
  'texture-compression-astc',
]

const ELEVATED_LIMIT_KEYS = [
  'maxStorageBufferBindingSize',
  'maxUniformBufferBindingSize',
  'maxComputeWorkgroupSizeX',
  'maxComputeWorkgroupSizeY',
  'maxComputeWorkgroupSizeZ',
  'maxComputeInvocationsPerWorkgroup',
  'maxComputeWorkgroupStorageSize',
  'maxBindGroups',
  'maxTextureDimension2D',
] as const satisfies readonly (keyof GPUSupportedLimits)[]

/**
 * Build the descriptor used for both probe and production device requests.
 */
export function buildWebGPUDeviceDescriptor(adapter: GPUAdapter): GPUDeviceDescriptor {
  const requiredFeatures = OPTIONAL_DEVICE_FEATURES.filter((feature) =>
    adapter.features.has(feature)
  )

  const requiredLimits: Record<string, number> = {}
  for (const key of ELEVATED_LIMIT_KEYS) {
    const value = adapter.limits[key]
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      requiredLimits[key] = value
    }
  }

  const descriptor: GPUDeviceDescriptor = {}
  if (requiredFeatures.length > 0) {
    descriptor.requiredFeatures = requiredFeatures
  }
  if (Object.keys(requiredLimits).length > 0) {
    descriptor.requiredLimits = requiredLimits
  }

  return descriptor
}

/** Return whether a device descriptor requests a feature. */
export function requestsWebGPUFeature(
  descriptor: GPUDeviceDescriptor,
  feature: GPUFeatureName
): boolean {
  return Array.from(descriptor.requiredFeatures ?? []).includes(feature)
}
