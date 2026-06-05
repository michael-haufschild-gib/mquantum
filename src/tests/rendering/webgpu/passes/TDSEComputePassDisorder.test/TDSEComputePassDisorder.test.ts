import { beforeEach, describe, expect, it, vi } from 'vitest'

const { maybeDispatchDisorderGenericMock } = vi.hoisted(() => ({
  maybeDispatchDisorderGenericMock: vi.fn(),
}))

vi.mock('@/rendering/webgpu/passes/DisorderOverlay', () => ({
  buildDisorderPipeline: vi.fn(),
  createDisorderState: vi.fn(() => ({
    buffer: null,
    uniformBuffer: null,
    pipeline: null,
    bgl: null,
    bg: null,
    lastHash: '',
  })),
  disposeDisorder: vi.fn(),
  maybeDispatchDisorder: maybeDispatchDisorderGenericMock,
}))

import { DEFAULT_TDSE_CONFIG } from '@/lib/geometry/extended/tdse'
import type { TdseConfig } from '@/lib/geometry/extended/types'
import { maybeDispatchDisorder } from '@/rendering/webgpu/passes/TDSEComputePassDisorder'

function dispatchWith(overrides: Partial<TdseConfig>): void {
  maybeDispatchDisorder(
    {} as GPUDevice,
    {} as Parameters<typeof maybeDispatchDisorder>[1],
    { ...DEFAULT_TDSE_CONFIG, ...overrides },
    {} as Parameters<typeof maybeDispatchDisorder>[3],
    {} as GPUBuffer,
    16,
    1,
    vi.fn() as unknown as Parameters<typeof maybeDispatchDisorder>[7]
  )
}

describe('TDSE disorder overlay adapter', () => {
  beforeEach(() => {
    maybeDispatchDisorderGenericMock.mockClear()
  })

  it('does not apply generic disorder to black-hole Regge-Wheeler ringdown', () => {
    dispatchWith({
      potentialType: 'blackHoleRingdown',
      disorderStrength: 10,
      disorderSeed: 123,
    })

    expect(maybeDispatchDisorderGenericMock).not.toHaveBeenCalled()
  })

  it('still forwards scaled disorder overlay for compatible TDSE potentials', () => {
    dispatchWith({
      potentialType: 'barrier',
      disorderStrength: 10,
      disorderSeed: 123,
    })

    expect(maybeDispatchDisorderGenericMock).toHaveBeenCalledOnce()
    const params = maybeDispatchDisorderGenericMock.mock.calls[0]?.[2] as
      | { amplitude?: number; seed?: number }
      | undefined
    expect(params?.seed).toBe(123)
    expect(params?.amplitude).toBeGreaterThan(0)
  })
})
