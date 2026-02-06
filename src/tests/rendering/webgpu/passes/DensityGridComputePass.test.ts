import { describe, expect, it, vi } from 'vitest'
import { DensityGridComputePass } from '@/rendering/webgpu/passes/DensityGridComputePass'

interface DensityGridComputePassInternals {
  schroedingerBuffer: GPUBuffer | null
  basisBuffer: GPUBuffer | null
  needsRecompute: boolean
  sortedRhoValues: Float32Array | null
  prefixMass: Float64Array | null
  totalMass: number
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

  it('recomputes uncertainty threshold from cached density distribution when confidence mass changes', () => {
    const pass = new DensityGridComputePass({ dimension: 4 })
    const internals = pass as unknown as DensityGridComputePassInternals

    internals.sortedRhoValues = new Float32Array([1.0, 0.4, 0.2, 0.1])
    internals.prefixMass = new Float64Array([1.0, 1.4, 1.6, 1.7])
    internals.totalMass = 1.7

    pass.setConfidenceMass(0.7)
    const threshold = pass.getLogRhoThreshold()
    expect(threshold).toBeCloseTo(Math.log(0.4), 5)
  })
})
