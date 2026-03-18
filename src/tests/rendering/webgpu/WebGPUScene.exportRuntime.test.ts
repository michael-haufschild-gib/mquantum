import { describe, expect, it } from 'vitest'

describe('WebGPUScene export runtime state', () => {
  it('treats fully idle runtime state as inactive', async () => {
    const sceneModule = (await import('@/rendering/webgpu/WebGPUScene')) as unknown as Record<
      string,
      unknown
    >
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
    const sceneModule = (await import('@/rendering/webgpu/WebGPUScene')) as unknown as Record<
      string,
      unknown
    >
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
