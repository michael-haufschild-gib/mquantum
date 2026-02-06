import { describe, expect, it, vi } from 'vitest'
import { DensityGridComputePass } from '@/rendering/webgpu/passes/DensityGridComputePass'

interface DensityGridComputePassInternals {
  schroedingerBuffer: GPUBuffer | null
  basisBuffer: GPUBuffer | null
  needsRecompute: boolean
}

function createMockDevice(writeBuffer: ReturnType<typeof vi.fn>): GPUDevice {
  return {
    queue: {
      writeBuffer,
    },
  } as unknown as GPUDevice
}

describe('DensityGridComputePass version-gated uploads', () => {
  it('uploads Schroedinger uniforms only when version changes', () => {
    const pass = new DensityGridComputePass({ dimension: 4 })
    const internals = pass as unknown as DensityGridComputePassInternals
    const writeBuffer = vi.fn()
    const device = createMockDevice(writeBuffer)
    const data = new ArrayBuffer(32)

    internals.schroedingerBuffer = {} as GPUBuffer
    internals.needsRecompute = false

    pass.updateSchroedingerUniforms(device, data, 5)
    expect(writeBuffer).toHaveBeenCalledTimes(1)
    expect(internals.needsRecompute).toBe(true)

    internals.needsRecompute = false
    pass.updateSchroedingerUniforms(device, data, 5)
    expect(writeBuffer).toHaveBeenCalledTimes(1)
    expect(internals.needsRecompute).toBe(false)

    pass.updateSchroedingerUniforms(device, data, 6)
    expect(writeBuffer).toHaveBeenCalledTimes(2)
    expect(internals.needsRecompute).toBe(true)
  })

  it('uploads basis uniforms only when version changes', () => {
    const pass = new DensityGridComputePass({ dimension: 4 })
    const internals = pass as unknown as DensityGridComputePassInternals
    const writeBuffer = vi.fn()
    const device = createMockDevice(writeBuffer)
    const data = new ArrayBuffer(64)

    internals.basisBuffer = {} as GPUBuffer
    internals.needsRecompute = false

    pass.updateBasisUniforms(device, data, 11)
    expect(writeBuffer).toHaveBeenCalledTimes(1)
    expect(internals.needsRecompute).toBe(true)

    internals.needsRecompute = false
    pass.updateBasisUniforms(device, data, 11)
    expect(writeBuffer).toHaveBeenCalledTimes(1)
    expect(internals.needsRecompute).toBe(false)

    pass.updateBasisUniforms(device, data, 12)
    expect(writeBuffer).toHaveBeenCalledTimes(2)
    expect(internals.needsRecompute).toBe(true)
  })
})
