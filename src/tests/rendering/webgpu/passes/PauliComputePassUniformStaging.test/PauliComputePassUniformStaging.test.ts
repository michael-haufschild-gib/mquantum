import { afterEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_PAULI_CONFIG } from '@/lib/geometry/extended/pauli'
import { PAULI_UNIFORM_SIZE } from '@/rendering/webgpu/passes/PauliComputePassBuffers'
import {
  createPauliUniformStepStagingState,
  prePackPauliFrameSnapshots,
} from '@/rendering/webgpu/passes/PauliComputePassUniformStaging'
import { PAULI_UNIFORMS_LAYOUT } from '@/rendering/webgpu/passes/pauliUniformsLayout'

describe('prePackPauliFrameSnapshots', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses midpoint times for time-dependent Strang kicks and final time for render uniforms', () => {
    vi.stubGlobal('GPUBufferUsage', { COPY_SRC: 1, COPY_DST: 2 })

    const writes: number[] = []
    const staging = { destroy: vi.fn() }
    const device = {
      createBuffer: vi.fn(() => staging),
      queue: {
        writeBuffer: vi.fn((_buffer: unknown, _offset: number, data: ArrayBuffer) => {
          const snapshot = new Float32Array(data.slice(0))
          writes.push(snapshot[PAULI_UNIFORMS_LAYOUT.index.simTime]!)
        }),
      },
    } as unknown as GPUDevice

    const state = createPauliUniformStepStagingState()
    const uniformData = new ArrayBuffer(PAULI_UNIFORM_SIZE)
    const uniformU32 = new Uint32Array(uniformData)
    const uniformF32 = new Float32Array(uniformData)

    const buffer = prePackPauliFrameSnapshots({
      state,
      device,
      config: {
        ...DEFAULT_PAULI_CONFIG,
        dt: 0.125,
        gridSize: [8, 8, 8],
        spacing: [0.2, 0.2, 0.2],
      },
      totalSites: 8 * 8 * 8,
      simTime: 10,
      stepsThisFrame: 3,
      maxDensity: 1,
      uniformU32,
      uniformF32,
      uniformData,
      boundingRadius: 5,
    })

    expect(buffer).toBe(staging)
    expect(writes).toEqual([10.0625, 10.1875, 10.3125, 10.375])
  })
})
