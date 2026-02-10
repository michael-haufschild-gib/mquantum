import { describe, expect, it } from 'vitest'

function ensureGPUConstants(): void {
  if (!('GPUTextureUsage' in globalThis)) {
    ;(globalThis as unknown as { GPUTextureUsage: Record<string, number> }).GPUTextureUsage = {
      TEXTURE_BINDING: 1 << 0,
      RENDER_ATTACHMENT: 1 << 1,
      COPY_SRC: 1 << 2,
      COPY_DST: 1 << 3,
      STORAGE_BINDING: 1 << 4,
    }
  }

  if (!('GPUBufferUsage' in globalThis)) {
    ;(globalThis as unknown as { GPUBufferUsage: Record<string, number> }).GPUBufferUsage = {
      UNIFORM: 1 << 0,
      COPY_DST: 1 << 1,
      VERTEX: 1 << 2,
      INDEX: 1 << 3,
      STORAGE: 1 << 4,
      COPY_SRC: 1 << 5,
      QUERY_RESOLVE: 1 << 6,
      MAP_READ: 1 << 7,
    }
  }
}

describe('WebGPUScene export runtime state', () => {
  it('treats fully idle runtime state as inactive', async () => {
    ensureGPUConstants()
    const sceneModule = (await import('@/rendering/webgpu/WebGPUScene')) as unknown as Record<
      string,
      unknown
    >
    expect(typeof sceneModule['isExportRuntimeActive']).toBe('function')
    const isExportRuntimeActive = sceneModule['isExportRuntimeActive'] as (runtime: {
      starting: boolean
      started: boolean
      processing: boolean
      finishing: boolean
      canceling: boolean
    }) => boolean

    expect(
      isExportRuntimeActive({
        starting: false,
        started: false,
        processing: false,
        finishing: false,
        canceling: false,
      })
    ).toBe(false)
  })

  it('treats any active export phase as active', async () => {
    ensureGPUConstants()
    const sceneModule = (await import('@/rendering/webgpu/WebGPUScene')) as unknown as Record<
      string,
      unknown
    >
    expect(typeof sceneModule['isExportRuntimeActive']).toBe('function')
    const isExportRuntimeActive = sceneModule['isExportRuntimeActive'] as (runtime: {
      starting: boolean
      started: boolean
      processing: boolean
      finishing: boolean
      canceling: boolean
    }) => boolean

    expect(
      isExportRuntimeActive({
        starting: true,
        started: false,
        processing: false,
        finishing: false,
        canceling: false,
      })
    ).toBe(true)

    expect(
      isExportRuntimeActive({
        starting: false,
        started: true,
        processing: false,
        finishing: false,
        canceling: false,
      })
    ).toBe(true)
  })
})
