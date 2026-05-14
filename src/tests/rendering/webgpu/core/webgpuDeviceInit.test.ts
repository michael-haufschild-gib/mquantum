/**
 * Integration tests for `WebGPUDevice.initialize()`'s structured-error
 * code path.
 *
 * The default test setup installs a `navigator.gpu` mock via
 * `installWebGPUMock`, but here we explicitly uninstall it for the
 * `NO_NAVIGATOR_GPU` test. The catch boundary in `WebGPUDevice` maps
 * the thrown `WebGPUInitError` to the failure result; this test pins
 * that mapping so a future refactor can't silently downgrade
 * `code: 'NO_NAVIGATOR_GPU'` to `code: 'INTERNAL_ERROR'` without a
 * test-suite break.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WebGPUDevice } from '@/rendering/webgpu/core/WebGPUDevice'
import { installWebGPUMock } from '@/tests/__mocks__/webgpu'

const NAVIGATOR_GPU_DESCRIPTOR = Object.getOwnPropertyDescriptor(navigator, 'gpu')

function uninstallWebGPUMock(): void {
  // Make `'gpu' in navigator` evaluate false so the
  // isWebGPUSupported() guard fires.
  Reflect.deleteProperty(navigator, 'gpu')
}

function reinstallWebGPUMock(): void {
  if (NAVIGATOR_GPU_DESCRIPTOR) {
    Object.defineProperty(navigator, 'gpu', NAVIGATOR_GPU_DESCRIPTOR)
  } else {
    installWebGPUMock()
  }
}

/**
 * Install a custom `navigator.gpu` shim that exposes `requestAdapter`
 * + `getPreferredCanvasFormat`. Tests pass a thunk that returns the
 * adapter (or null / throws) so each failure-code path can be exercised
 * without a real GPU.
 */
function installFakeGpu(
  requestAdapter: () => Promise<unknown> | unknown,
  options: { getPreferredCanvasFormat?: () => GPUTextureFormat } = {}
): void {
  const fakeGpu = {
    requestAdapter: vi.fn(async () => requestAdapter()),
    getPreferredCanvasFormat:
      options.getPreferredCanvasFormat ?? (() => 'bgra8unorm' as GPUTextureFormat),
    wgslLanguageFeatures: new Set(),
  }
  Object.defineProperty(navigator, 'gpu', {
    writable: true,
    configurable: true,
    value: fakeGpu,
  })
}

describe('WebGPUDevice.initialize() error contract', () => {
  beforeEach(() => {
    WebGPUDevice.resetForTesting()
  })

  afterEach(() => {
    WebGPUDevice.resetForTesting()
    reinstallWebGPUMock()
  })

  it('returns NO_NAVIGATOR_GPU when navigator.gpu is undefined', async () => {
    uninstallWebGPUMock()
    // Precondition: confirm the uninstall actually deleted the property.
    // `'gpu' in navigator` would trip the no-shallow-matchers lint, so we
    // sample the property descriptor instead — `undefined` ⇔ deleted.
    expect(Object.getOwnPropertyDescriptor(navigator, 'gpu')).toBeUndefined()

    const device = WebGPUDevice.getInstance()
    const canvas = document.createElement('canvas')
    const result = await device.initialize(canvas)

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('NO_NAVIGATOR_GPU')
    expect(result.error).toContain('WebGPU is not supported')
    // The catch boundary attaches the original WebGPUInitError as `cause`.
    expect(result.cause).toBeInstanceOf(Error)
  })

  it('returns NO_NAVIGATOR_GPU when navigator.gpu exists but is undefined', async () => {
    Object.defineProperty(navigator, 'gpu', {
      writable: true,
      configurable: true,
      value: undefined,
    })

    const device = WebGPUDevice.getInstance()
    const canvas = document.createElement('canvas')
    const result = await device.initialize(canvas)

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('NO_NAVIGATOR_GPU')
    expect(result.error).toContain('WebGPU is not supported')
  })

  it('caches the same failure result across repeated calls with the same canvas', async () => {
    uninstallWebGPUMock()

    const device = WebGPUDevice.getInstance()
    const canvas = document.createElement('canvas')

    const a = await device.initialize(canvas)
    const b = await device.initialize(canvas)

    expect(a).toBe(b)
  })

  it('does not let a superseded canvas initialization publish over the current canvas', async () => {
    const fakeLimits = {
      maxStorageBufferBindingSize: 134217728,
      maxUniformBufferBindingSize: 65536,
      maxComputeWorkgroupSizeX: 256,
      maxComputeWorkgroupSizeY: 256,
      maxComputeWorkgroupSizeZ: 64,
      maxComputeInvocationsPerWorkgroup: 256,
      maxComputeWorkgroupStorageSize: 16384,
      maxBindGroups: 4,
      maxTextureDimension2D: 8192,
    }
    const firstDestroy = vi.fn()
    const secondDestroy = vi.fn()
    const firstDevice = {
      lost: new Promise(() => {}),
      limits: fakeLimits,
      features: new Set<GPUFeatureName>(),
      queue: { writeBuffer: vi.fn() },
      destroy: firstDestroy,
    }
    const secondDevice = {
      lost: new Promise(() => {}),
      limits: fakeLimits,
      features: new Set<GPUFeatureName>(),
      queue: { writeBuffer: vi.fn() },
      destroy: secondDestroy,
    }
    let resolveFirstDevice!: (device: typeof firstDevice) => void
    const firstDevicePromise = new Promise<typeof firstDevice>((resolve) => {
      resolveFirstDevice = resolve
    })
    const firstAdapter = {
      features: new Set<GPUFeatureName>(),
      limits: fakeLimits,
      info: { vendor: 'first', architecture: 'mock', device: 'gpu-a' },
      isFallbackAdapter: false,
      requestDevice: vi.fn(() => firstDevicePromise),
    }
    const secondAdapter = {
      features: new Set<GPUFeatureName>(),
      limits: fakeLimits,
      info: { vendor: 'second', architecture: 'mock', device: 'gpu-b' },
      isFallbackAdapter: false,
      requestDevice: vi.fn(async () => secondDevice),
    }
    const adapters = [firstAdapter, secondAdapter]
    installFakeGpu(() => adapters.shift() ?? null)

    const firstContext = { configure: vi.fn(), unconfigure: vi.fn() }
    const secondContext = { configure: vi.fn(), unconfigure: vi.fn() }
    const firstCanvas = document.createElement('canvas')
    const secondCanvas = document.createElement('canvas')
    Object.defineProperty(firstCanvas, 'getContext', {
      configurable: true,
      value: vi.fn((contextId: string) => (contextId === 'webgpu' ? firstContext : null)),
    })
    Object.defineProperty(secondCanvas, 'getContext', {
      configurable: true,
      value: vi.fn((contextId: string) => (contextId === 'webgpu' ? secondContext : null)),
    })

    const device = WebGPUDevice.getInstance()
    const firstInit = device.initialize(firstCanvas)
    const secondInit = device.initialize(secondCanvas)
    const secondResult = await secondInit

    resolveFirstDevice(firstDevice)
    const firstResult = await firstInit

    expect(secondResult.success).toBe(true)
    expect(firstResult.success).toBe(false)
    if (firstResult.success || !secondResult.success) return
    expect(firstResult.code).toBe('INTERNAL_ERROR')
    expect(firstResult.error).toContain('superseded')
    expect(device.getDevice()).toBe(secondDevice)
    expect(device.getContext()).toBe(secondContext)
    expect(firstContext.unconfigure).toHaveBeenCalledTimes(1)
    expect(firstDestroy).toHaveBeenCalledTimes(1)
    expect(secondContext.unconfigure).not.toHaveBeenCalled()
    expect(secondDestroy).not.toHaveBeenCalled()
  })

  it('reports a stable error string suitable for the data-renderer-error DOM attribute', async () => {
    uninstallWebGPUMock()

    const device = WebGPUDevice.getInstance()
    const canvas = document.createElement('canvas')
    const result = await device.initialize(canvas)

    expect(result.success).toBe(false)
    if (result.success) return
    // The error message lands verbatim in `data-renderer-error` and is
    // visible to the user. Reject empty / promise-toString-style messages.
    expect(result.error.length).toBeGreaterThan(10)
    expect(result.error).not.toMatch(/^\[object .*\]$/)
  })

  it('returns ADAPTER_REQUEST_FAILED when requestAdapter resolves to null', async () => {
    installFakeGpu(() => null)

    const device = WebGPUDevice.getInstance()
    const canvas = document.createElement('canvas')
    const result = await device.initialize(canvas)

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('ADAPTER_REQUEST_FAILED')
    expect(result.error.toLowerCase()).toContain('adapter')
  })

  it('returns ADAPTER_REQUEST_FAILED when requestAdapter throws', async () => {
    installFakeGpu(() => {
      throw new Error('adapter request blew up')
    })

    const device = WebGPUDevice.getInstance()
    const canvas = document.createElement('canvas')
    const result = await device.initialize(canvas)

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('ADAPTER_REQUEST_FAILED')
    // The wrapped failure carries the underlying error as cause so devs
    // can inspect the original throw site without parsing the message.
    expect(result.cause).toBeInstanceOf(Error)
  })

  it('returns DEVICE_REQUEST_FAILED when adapter.requestDevice rejects', async () => {
    const fakeAdapter = {
      features: new Set<GPUFeatureName>(),
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
      info: { vendor: 'fake', architecture: 'fake', device: 'fake' },
      isFallbackAdapter: false,
      requestDevice: vi.fn(() => {
        return Promise.reject(new Error('device request rejected by mock'))
      }),
    }
    installFakeGpu(() => fakeAdapter)

    const device = WebGPUDevice.getInstance()
    const canvas = document.createElement('canvas')
    const result = await device.initialize(canvas)

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('DEVICE_REQUEST_FAILED')
    expect(result.error).toContain('device request rejected by mock')
  })

  it('destroys the provisional device when context configuration fails', async () => {
    const fakeLimits = {
      maxStorageBufferBindingSize: 134217728,
      maxUniformBufferBindingSize: 65536,
      maxComputeWorkgroupSizeX: 256,
      maxComputeWorkgroupSizeY: 256,
      maxComputeWorkgroupSizeZ: 64,
      maxComputeInvocationsPerWorkgroup: 256,
      maxComputeWorkgroupStorageSize: 16384,
      maxBindGroups: 4,
      maxTextureDimension2D: 8192,
    }
    const destroy = vi.fn()
    const fakeDevice = {
      lost: new Promise(() => {}),
      limits: fakeLimits,
      features: new Set<GPUFeatureName>(),
      queue: { writeBuffer: vi.fn() },
      destroy,
    }
    const fakeAdapter = {
      features: new Set<GPUFeatureName>(),
      limits: fakeLimits,
      info: { vendor: 'fake', architecture: 'fake', device: 'fake' },
      isFallbackAdapter: false,
      requestDevice: vi.fn(async () => fakeDevice),
    }
    installFakeGpu(() => fakeAdapter)

    const configure = vi.fn(() => {
      throw new Error('configure rejected by mock')
    })
    const fakeContext = {
      configure,
    } as unknown as GPUCanvasContext
    const canvas = document.createElement('canvas')
    Object.defineProperty(canvas, 'getContext', {
      configurable: true,
      value: vi.fn((contextId: string) => (contextId === 'webgpu' ? fakeContext : null)),
    })

    const device = WebGPUDevice.getInstance()
    const result = await device.initialize(canvas)

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('CONTEXT_CONFIGURE_FAILED')
    expect(result.error).toContain('configure rejected by mock')
    expect(configure).toHaveBeenCalledTimes(1)
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('returns INTERNAL_ERROR for unexpected throws inside doInitialize', async () => {
    // Force a non-WebGPUInitError throw deep inside doInitialize by
    // making `getPreferredCanvasFormat` throw. That call sits between
    // the adapter / device requests and the context.configure call, so
    // the catch boundary only sees a plain Error.
    const fakeAdapter = {
      features: new Set<GPUFeatureName>(),
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
      info: { vendor: 'fake', architecture: 'fake', device: 'fake' },
      isFallbackAdapter: false,
      requestDevice: vi.fn(async () => {
        return {
          lost: new Promise(() => {}),
          limits: fakeAdapter.limits,
          features: fakeAdapter.features,
          queue: { writeBuffer: vi.fn() },
        }
      }),
    }
    installFakeGpu(() => fakeAdapter, {
      getPreferredCanvasFormat: () => {
        throw new Error('synthesised internal failure')
      },
    })

    const device = WebGPUDevice.getInstance()
    const canvas = document.createElement('canvas')
    const result = await device.initialize(canvas)

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('INTERNAL_ERROR')
    expect(result.error).toContain('synthesised internal failure')
  })
})
