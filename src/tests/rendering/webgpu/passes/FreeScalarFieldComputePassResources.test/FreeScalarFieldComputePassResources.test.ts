import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_FREE_SCALAR_CONFIG } from '@/lib/geometry/extended/freeScalar'
import type { FreeScalarConfig } from '@/lib/geometry/extended/types'
import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import {
  type FsfInitContext,
  initializeFsfField,
} from '@/rendering/webgpu/passes/FreeScalarFieldComputePassResources'
import {
  FSF_COSMO_COEFS_BYTE_OFFSET,
  FSF_DT_BYTE_OFFSET,
} from '@/rendering/webgpu/passes/FreeScalarFieldComputePassUniforms'

type FakeBuffer = GPUBuffer & {
  backing: ArrayBuffer
  label?: string
  destroy: ReturnType<typeof vi.fn>
}

function createRenderState(writeBuffer = vi.fn()): WebGPURenderContext {
  return {
    device: {
      queue: { writeBuffer },
    },
    encoder: {
      copyBufferToBuffer: vi.fn(),
    },
  } as unknown as WebGPURenderContext
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

function createInitContext(overrides: Partial<FsfInitContext> = {}): FsfInitContext {
  return {
    pl: null,
    bg: null,
    phiBuffer: {} as GPUBuffer,
    piBuffer: {} as GPUBuffer,
    uniformBuffer: null,
    totalSites: 4,
    simEta: 0,
    pendingInjection: null,
    pendingStagingBuffers: [],
    kSpace: {
      invalidateReadbacks: vi.fn(),
    } as unknown as FsfInitContext['kSpace'],
    preheatingTime: 0,
    preheatingReferenceEta: 0,
    dispatchCompute: vi.fn(),
    beginComputePass: vi.fn(),
    ...overrides,
  }
}

interface CopyEvent {
  label?: string
  dstOffset: number
  values: number[]
}

describe('initializeFsfField save-state injection', () => {
  const config: FreeScalarConfig = {
    ...DEFAULT_FREE_SCALAR_CONFIG,
    initialCondition: 'gaussianPacket',
  }

  it('rejects length-mismatched save-state data instead of partial-uploading stale tails', () => {
    const writeBuffer = vi.fn()
    const renderState = createRenderState(writeBuffer)
    const initState = createInitContext({
      pendingInjection: {
        re: new Float32Array([1, 2]),
        im: new Float32Array([3, 4, 5, 6]),
      },
    })

    expect(() => initializeFsfField(renderState, config, initState)).toThrow(
      '[FSF] Invalid save-state length: expected re=im=4, got re=2, im=4'
    )
    expect(writeBuffer).not.toHaveBeenCalled()
    // Note: clearing the pending injection on failure is the *caller's*
    // responsibility (FreeScalarFieldComputePass.initializeField clears the
    // class field before invoking us). See the class-level regression test
    // below for the full infinite-throw-loop fix.
  })

  it('uploads exact-length save-state data to phi and pi buffers', () => {
    const writeBuffer = vi.fn()
    const renderState = createRenderState(writeBuffer)
    const re = new Float32Array([1, 2, 3, 4])
    const im = new Float32Array([5, 6, 7, 8])
    const initState = createInitContext({
      pendingInjection: { re, im },
    })

    const result = initializeFsfField(renderState, config, initState)

    expect(writeBuffer).toHaveBeenNthCalledWith(1, initState.phiBuffer, 0, re)
    expect(writeBuffer).toHaveBeenNthCalledWith(2, initState.piBuffer, 0, im)
    expect(initState.kSpace.invalidateReadbacks).toHaveBeenCalled()
    expect(result.pendingInjection).toBeNull()
    expect(result.initialized).toBe(true)
  })

  it('stages kickstart cosmology/preheating coefficients before the kick pass', () => {
    const copies: CopyEvent[] = []
    const events: string[] = []
    const writeBuffer = vi.fn()
    const uniformBuffer = fakeBuffer(528, 'uniforms')
    const renderState = {
      device: {
        queue: { writeBuffer },
        createBuffer: vi.fn((desc: GPUBufferDescriptor) =>
          fakeBuffer(Number(desc.size), String(desc.label ?? 'staging'))
        ),
      },
      encoder: {
        copyBufferToBuffer: vi.fn(
          (
            src: FakeBuffer,
            _srcOffset: number,
            _dst: GPUBuffer,
            dstOffset: number,
            size: number
          ) => {
            copies.push({
              label: src.label,
              dstOffset,
              values: Array.from(new Float32Array(src.backing.slice(0, size))),
            })
            events.push(`copy:${dstOffset}`)
          }
        ),
      },
    } as unknown as WebGPURenderContext
    const initState = createInitContext({
      pl: {
        initPipeline: { label: 'init' },
        updatePiPipeline: { label: 'update-pi' },
      } as unknown as FsfInitContext['pl'],
      bg: {
        initBG: {},
        updatePiBG: {},
      } as unknown as FsfInitContext['bg'],
      uniformBuffer,
      beginComputePass: vi.fn((descriptor: GPUComputePassDescriptor) => {
        events.push(`pass:${descriptor.label}`)
        return {
          end: vi.fn(),
          setPipeline: vi.fn(),
          setBindGroup: vi.fn(),
          dispatchWorkgroups: vi.fn(),
        } as unknown as GPUComputePassEncoder
      }),
    })
    const preheating = {
      ...DEFAULT_FREE_SCALAR_CONFIG.preheating,
      enabled: true,
      amplitude: 0.5,
      frequency: 20,
    }
    const kickConfig: FreeScalarConfig = {
      ...config,
      dt: 0.2,
      preheating,
      cosmology: { ...DEFAULT_FREE_SCALAR_CONFIG.cosmology, enabled: false },
    }

    initializeFsfField(renderState, kickConfig, initState)

    expect(writeBuffer).not.toHaveBeenCalledWith(
      uniformBuffer,
      expect.any(Number),
      expect.anything()
    )
    expect(copies.map((copy) => copy.dstOffset)).toEqual([
      FSF_COSMO_COEFS_BYTE_OFFSET,
      FSF_DT_BYTE_OFFSET,
      FSF_DT_BYTE_OFFSET,
    ])
    expect(events).toEqual([
      'pass:free-scalar-init-pass',
      `copy:${FSF_COSMO_COEFS_BYTE_OFFSET}`,
      `copy:${FSF_DT_BYTE_OFFSET}`,
      'pass:free-scalar-leapfrog-kickstart',
      `copy:${FSF_DT_BYTE_OFFSET}`,
    ])
    const coefs = copies[0]
    expect(coefs?.label).toBe('free-scalar-kickstart-cosmo-coefs-staging')
    expect(coefs?.values[0]).toBe(1)
    expect(coefs?.values[1]).toBe(1)
    expect(coefs?.values[2]).toBe(1)
    expect(coefs?.values[3]).toBeCloseTo(1 + 0.5 * Math.sin(20 * 0.05), 6)
    expect(initState.pendingStagingBuffers.map((buffer) => buffer.label)).toEqual([
      'free-scalar-kickstart-cosmo-coefs-staging',
      'free-scalar-half-dt-staging',
      'free-scalar-full-dt-staging',
    ])
  })
})
