import { describe, expect, it, vi } from 'vitest'
import { DensityGridComputePass } from '@/rendering/webgpu/passes/DensityGridComputePass'
import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'

interface DensityGridComputePassInternals {
  schroedingerBuffer: GPUBuffer | null
  basisBuffer: GPUBuffer | null
  needsRecompute: boolean
  sortedRhoValues: Float32Array | null
  prefixMass: Float64Array | null
  totalMass: number
}

interface DensityGridReadbackInternals extends DensityGridComputePassInternals {
  computePipeline: GPUComputePipeline | null
  computeBindGroup: GPUBindGroup | null
  device: GPUDevice | null
  densityTexture: GPUTexture | null
  densityReadbackBuffer: GPUBuffer | null
  readbackBytesPerRow: number
  readbackBytesPerTexel: number
  readbackTexelStrideHalfs: number
  readbackInFlight: boolean
  readbackPendingSubmit: boolean
  shouldRefreshDistribution: boolean
  gridSize: number
}

function createMockDevice(writeBuffer: ReturnType<typeof vi.fn>): GPUDevice {
  return {
    queue: {
      writeBuffer,
    },
  } as unknown as GPUDevice
}

function ensureGPUMapMode(): void {
  if (!('GPUMapMode' in globalThis)) {
    ;(globalThis as unknown as { GPUMapMode: { READ: number; WRITE: number } }).GPUMapMode = {
      READ: 1,
      WRITE: 2,
    }
  }
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

  it('defers density readback mapping to postFrame after queue submission', async () => {
    ensureGPUMapMode()

    const pass = new DensityGridComputePass({ dimension: 4 })
    const internals = pass as unknown as DensityGridReadbackInternals

    const copyTextureToBuffer = vi.fn()
    const mapAsync = vi.fn().mockResolvedValue(undefined)
    const getMappedRange = vi.fn(() => new ArrayBuffer(256))
    const unmap = vi.fn()
    const onSubmittedWorkDone = vi.fn().mockResolvedValue(undefined)

    internals.computePipeline = {} as GPUComputePipeline
    internals.computeBindGroup = {} as GPUBindGroup
    internals.device = {
      queue: {
        onSubmittedWorkDone,
      },
    } as unknown as GPUDevice
    internals.densityTexture = {} as GPUTexture
    internals.densityReadbackBuffer = {
      mapAsync,
      getMappedRange,
      unmap,
    } as unknown as GPUBuffer
    internals.readbackBytesPerRow = 256
    internals.readbackBytesPerTexel = 2
    internals.readbackTexelStrideHalfs = 1
    internals.readbackInFlight = false
    internals.readbackPendingSubmit = false
    internals.shouldRefreshDistribution = true
    internals.gridSize = 1
    internals.needsRecompute = true

    const computePass = {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      dispatchWorkgroups: vi.fn(),
      end: vi.fn(),
    } as unknown as GPUComputePassEncoder

    const ctx = {
      beginComputePass: vi.fn(() => computePass),
      encoder: { copyTextureToBuffer },
      frame: {
        stores: {
          animation: { accumulatedTime: 0 },
        },
        time: 0,
      },
    } as unknown as WebGPURenderContext

    pass.execute(ctx)

    expect(copyTextureToBuffer).toHaveBeenCalledTimes(1)
    expect(mapAsync).not.toHaveBeenCalled()
    expect(internals.readbackPendingSubmit).toBe(true)

    pass.postFrame?.()
    await Promise.resolve()
    await Promise.resolve()

    expect(onSubmittedWorkDone).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => {
      expect(mapAsync).toHaveBeenCalledTimes(1)
      expect(unmap).toHaveBeenCalledTimes(1)
    })
    expect(internals.readbackInFlight).toBe(false)
    expect(internals.readbackPendingSubmit).toBe(false)
  })
})
