import { describe, expect, it } from 'vitest'

import {
  buildWebGPUDeviceDescriptor,
  requestsWebGPUFeature,
} from '@/rendering/webgpu/core/deviceDescriptor'

function createAdapter({
  features = [],
  limits = {},
}: {
  features?: GPUFeatureName[]
  limits?: Partial<Record<keyof GPUSupportedLimits, number>>
} = {}): GPUAdapter {
  return {
    features: new Set(features),
    limits,
  } as unknown as GPUAdapter
}

describe('buildWebGPUDeviceDescriptor', () => {
  it('requests supported optional production features and elevated limits', () => {
    const descriptor = buildWebGPUDeviceDescriptor(
      createAdapter({
        features: ['timestamp-query', 'texture-compression-bc'],
        limits: {
          maxStorageBufferBindingSize: 134217728,
          maxUniformBufferBindingSize: 65536,
          maxComputeWorkgroupSizeX: 256,
          maxComputeWorkgroupSizeY: 256,
          maxComputeWorkgroupSizeZ: 64,
          maxComputeInvocationsPerWorkgroup: 256,
          maxComputeWorkgroupStorageSize: 16384,
          maxBindGroups: 4,
          maxTextureDimension2D: 8192,
        },
      })
    )

    expect(descriptor.requiredFeatures).toEqual(['timestamp-query', 'texture-compression-bc'])
    expect(descriptor.requiredLimits).toEqual({
      maxStorageBufferBindingSize: 134217728,
      maxUniformBufferBindingSize: 65536,
      maxComputeWorkgroupSizeX: 256,
      maxComputeWorkgroupSizeY: 256,
      maxComputeWorkgroupSizeZ: 64,
      maxComputeInvocationsPerWorkgroup: 256,
      maxComputeWorkgroupStorageSize: 16384,
      maxBindGroups: 4,
      maxTextureDimension2D: 8192,
    })
    expect(requestsWebGPUFeature(descriptor, 'timestamp-query')).toBe(true)
    expect(requestsWebGPUFeature(descriptor, 'texture-compression-astc')).toBe(false)
  })

  it('omits invalid or unavailable limits instead of passing undefined to requestDevice', () => {
    const descriptor = buildWebGPUDeviceDescriptor(
      createAdapter({
        limits: {
          maxStorageBufferBindingSize: Number.NaN,
          maxUniformBufferBindingSize: 0,
          maxComputeWorkgroupSizeX: 256,
        },
      })
    )

    expect(descriptor.requiredFeatures).toBeUndefined()
    expect(descriptor.requiredLimits).toEqual({
      maxComputeWorkgroupSizeX: 256,
    })
  })
})
