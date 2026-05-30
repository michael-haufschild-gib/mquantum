import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_FREE_SCALAR_CONFIG } from '@/lib/geometry/extended/freeScalar'
import type { FreeScalarConfig } from '@/lib/geometry/extended/types'
import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import { FreeScalarFieldComputePass } from '@/rendering/webgpu/passes/FreeScalarFieldComputePass'
import {
  computeFsfConfigHash,
  computeFsfInitHash,
  FSF_COSMO_COEFS_BYTE_OFFSET,
  FSF_DT_BYTE_OFFSET,
} from '@/rendering/webgpu/passes/FreeScalarFieldComputePassUniforms'

type FakeBuffer = GPUBuffer & {
  backing: ArrayBuffer
  label?: string
  destroy: ReturnType<typeof vi.fn>
}

interface CopyEvent {
  label?: string
  dstOffset: number
  size: number
  values: number[]
}

const originalGpuBufferUsage = (globalThis as { GPUBufferUsage?: unknown }).GPUBufferUsage

function makeConfig(): FreeScalarConfig {
  return {
    ...DEFAULT_FREE_SCALAR_CONFIG,
    latticeDim: 1,
    gridSize: [4],
    spacing: [1],
    mass: 1,
    dt: 0.2,
    stepsPerFrame: 1,
    initialCondition: 'singleMode',
    autoScale: false,
    needsReset: false,
    cosmology: { ...DEFAULT_FREE_SCALAR_CONFIG.cosmology, enabled: false },
    preheating: {
      ...DEFAULT_FREE_SCALAR_CONFIG.preheating,
      enabled: true,
      amplitude: 0.5,
      frequency: 20,
    },
  }
}

function fakeBuffer(size = 4, label = 'buffer'): FakeBuffer {
  const backing = new ArrayBuffer(size)
  return {
    backing,
    label,
    destroy: vi.fn(),
    getMappedRange: vi.fn(() => backing),
    unmap: vi.fn(),
  } as unknown as FakeBuffer
}

function makeContext(
  copies: CopyEvent[],
  writeBuffer: ReturnType<typeof vi.fn>
): WebGPURenderContext {
  const device = {
    queue: { writeBuffer },
    createBuffer: vi.fn((desc: GPUBufferDescriptor) =>
      fakeBuffer(Number(desc.size), String(desc.label ?? 'staging'))
    ),
  }
  const encoder = {
    copyBufferToBuffer: vi.fn(
      (src: FakeBuffer, _srcOffset: number, _dst: GPUBuffer, dstOffset: number, size: number) => {
        copies.push({
          label: src.label,
          dstOffset,
          size,
          values: Array.from(new Float32Array(src.backing.slice(0, size))),
        })
      }
    ),
  }
  const beginComputePass = vi.fn((desc: GPUComputePassDescriptor) => ({
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    dispatchWorkgroups: vi.fn(),
    end: vi.fn(),
    label: desc.label,
  }))

  return { device, encoder, beginComputePass } as unknown as WebGPURenderContext
}

function primePass(pass: FreeScalarFieldComputePass, config: FreeScalarConfig): void {
  const internal = pass as unknown as Record<string, unknown>
  internal.phiBuffer = fakeBuffer(16, 'phi')
  internal.piBuffer = fakeBuffer(16, 'pi')
  internal.uniformBuffer = fakeBuffer(528, 'uniforms')
  internal.totalSites = 4
  internal.initialized = true
  internal.lastConfigHash = computeFsfConfigHash(config)
  internal.lastInitHash = computeFsfInitHash(config)
  internal.maxPhiEstimate = 1
  internal.pl = {
    updatePhiPipeline: { label: 'updatePhi' },
    updatePiPipeline: { label: 'updatePi' },
    writeGridPipeline: { label: 'writeGrid' },
  }
  internal.bg = {
    updatePhiBG: {},
    updatePiBG: {},
    writeGridBG: {},
  }
  internal.kSpace = {
    takePendingData: vi.fn(() => null),
    maybeStartKSpaceReadback: vi.fn(),
    maybeStartDiagnosticsReadback: vi.fn(),
    invalidateReadbacks: vi.fn(),
  }
}

describe('FreeScalarFieldComputePass ordered uniform staging', () => {
  beforeEach(() => {
    ;(globalThis as { GPUBufferUsage?: { COPY_SRC: number } }).GPUBufferUsage = { COPY_SRC: 4 }
  })

  afterEach(() => {
    ;(globalThis as { GPUBufferUsage?: unknown }).GPUBufferUsage = originalGpuBufferUsage
  })

  it('stages per-substep dt and cosmology coefficients through ordered command-buffer copies', () => {
    const config = makeConfig()
    const pass = new FreeScalarFieldComputePass(4)
    primePass(pass, config)

    const copies: CopyEvent[] = []
    const writeBuffer = vi.fn()
    const ctx = makeContext(copies, writeBuffer)

    pass.executeField(ctx, config, true, 1)

    const dtCopies = copies.filter((copy) => copy.dstOffset === FSF_DT_BYTE_OFFSET)
    const coefCopies = copies.filter((copy) => copy.dstOffset === FSF_COSMO_COEFS_BYTE_OFFSET)

    expect(dtCopies.length).toBeGreaterThanOrEqual(2)
    expect(coefCopies.length).toBeGreaterThan(1)
    expect(new Set(coefCopies.map((copy) => copy.values[3]?.toFixed(6))).size).toBeGreaterThan(1)

    const expectedFinalMassScale =
      1 + config.preheating.amplitude * Math.sin(config.preheating.frequency * config.dt)
    const readoutCopy = coefCopies.find((copy) => copy.label === 'free-scalar-cosmo-coefs-readout')
    expect(readoutCopy?.values[3]).toBeCloseTo(expectedFinalMassScale, 6)

    const internal = pass as unknown as {
      kSpace: { maybeStartDiagnosticsReadback: ReturnType<typeof vi.fn> }
    }
    const diagnosticsCoefs = internal.kSpace.maybeStartDiagnosticsReadback.mock.calls.at(-1)?.[6]
    expect(diagnosticsCoefs?.massSquaredScale).toBeCloseTo(expectedFinalMassScale, 6)

    const partialQueueWrites = writeBuffer.mock.calls.filter(
      (call) => call[1] === FSF_DT_BYTE_OFFSET || call[1] === FSF_COSMO_COEFS_BYTE_OFFSET
    )
    expect(partialQueueWrites).toEqual([])
  })
})
