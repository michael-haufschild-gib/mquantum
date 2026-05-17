import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createWormholeReadbackState,
  requestWormholeReadback,
} from '@/rendering/webgpu/passes/TDSEWormholeReadback'
import { useWormholeCoherenceStore } from '@/stores/diagnostics/wormholeCoherenceStore'

function createMappedStaging(values: number[]): GPUBuffer {
  const bytes = new Float32Array(values).buffer
  const buffer = {
    mapState: 'unmapped' as GPUBufferMapState,
    mapAsync: vi.fn(() => {
      buffer.mapState = 'mapped' as GPUBufferMapState
      return Promise.resolve()
    }),
    getMappedRange: vi.fn(() => bytes),
    unmap: vi.fn(() => {
      buffer.mapState = 'unmapped' as GPUBufferMapState
    }),
    destroy: vi.fn(),
  }
  return buffer as unknown as GPUBuffer
}

async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('requestWormholeReadback', () => {
  beforeEach(() => {
    useWormholeCoherenceStore.getState().clear()
  })

  it('does not allocate or copy for invalid lattice sizes', () => {
    const state = createWormholeReadbackState()
    const createBuffer = vi.fn()
    const copyBufferToBuffer = vi.fn()
    const device = {
      createBuffer,
      queue: { onSubmittedWorkDone: vi.fn().mockResolvedValue(undefined) },
    } as unknown as GPUDevice
    const encoder = { copyBufferToBuffer } as unknown as GPUCommandEncoder
    const psi = { label: 'psi' } as GPUBuffer

    requestWormholeReadback(device, encoder, state, true, psi, Number.NaN, [2], 0, 1, 0)
    requestWormholeReadback(device, encoder, state, true, psi, 1.5, [2], 0, 1, 0)
    requestWormholeReadback(device, encoder, state, true, psi, 0, [2], 0, 1, 0)

    expect(createBuffer).not.toHaveBeenCalled()
    expect(copyBufferToBuffer).not.toHaveBeenCalled()
    expect(state.mappingInFlight).toBe(false)
  })

  it('normalizes captured axis and coupling metadata before pushing samples', async () => {
    const state = createWormholeReadbackState()
    const staging = createMappedStaging([1, 0, 0, 0])
    const copyBufferToBuffer = vi.fn()
    const device = {
      createBuffer: vi.fn(() => staging),
      queue: { onSubmittedWorkDone: vi.fn().mockResolvedValue(undefined) },
    } as unknown as GPUDevice
    const encoder = { copyBufferToBuffer } as unknown as GPUCommandEncoder
    const psi = { label: 'psi' } as GPUBuffer

    requestWormholeReadback(
      device,
      encoder,
      state,
      true,
      psi,
      2,
      [2],
      2,
      Number.POSITIVE_INFINITY,
      1.25
    )
    await flushPromises()

    const store = useWormholeCoherenceStore.getState()
    expect(copyBufferToBuffer).toHaveBeenCalledWith(psi, 0, staging, 0, 16)
    expect(store.buffer.count).toBe(1)
    expect(store.lastAxis).toBe(0)
    expect(store.lastG).toBe(0)
    expect(store.lastT).toBe(1.25)
  })
})
