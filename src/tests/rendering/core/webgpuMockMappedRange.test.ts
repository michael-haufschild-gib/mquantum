/**
 * The shared WebGPU mock's buffers must expose a mapped range the size of the
 * buffer: it used to return a fresh 0-byte ArrayBuffer, so filling a
 * `mappedAtCreation` range with typed-array `.set()` threw a RangeError and
 * readback code under test read `undefined` for every element.
 */
import { describe, expect, it } from 'vitest'

import { mockWebGPU } from '@/tests/__mocks__/webgpu'

describe('WebGPU mock mapped ranges', () => {
  it('backs the whole range with the buffer size and keeps writes', () => {
    const buffer = mockWebGPU.device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    })
    const view = new Float32Array(buffer.getMappedRange())
    expect(view.length).toBe(4)
    view.set([1, 2, 3, 4])
    expect(Array.from(new Float32Array(buffer.getMappedRange()))).toEqual([1, 2, 3, 4])
  })

  it('returns an offset / size window of the backing store', () => {
    const buffer = mockWebGPU.device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST })
    new Float32Array(buffer.getMappedRange()).set([5, 6, 7, 8])
    expect(Array.from(new Float32Array(buffer.getMappedRange(8, 8)))).toEqual([7, 8])
  })
})

describe('WebGPU mock map state', () => {
  it('follows mapAsync / unmap and mappedAtCreation', async () => {
    const created = mockWebGPU.device.createBuffer({
      size: 8,
      usage: GPUBufferUsage.COPY_SRC,
      mappedAtCreation: true,
    })
    expect(created.mapState).toBe('mapped')
    created.unmap()
    expect(created.mapState).toBe('unmapped')

    const staging = mockWebGPU.device.createBuffer({
      size: 8,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })
    expect(staging.mapState).toBe('unmapped')
    await staging.mapAsync(GPUMapMode.READ)
    expect(staging.mapState).toBe('mapped')
  })
})
