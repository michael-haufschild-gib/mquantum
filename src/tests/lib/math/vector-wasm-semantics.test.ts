import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EPSILON } from '@/lib/math/types'

type NormalizeWasmImpl = (v: Float64Array) => Float64Array

async function loadVectorWithWasm(normalizeImpl: NormalizeWasmImpl) {
  const normalizeVectorWasm = vi.fn(normalizeImpl)

  vi.doMock('@/lib/wasm', () => ({
    dotProductWasm: vi.fn(),
    float64ToVector: (v: Float64Array) => Array.from(v),
    isAnimationWasmReady: () => true,
    magnitudeWasm: vi.fn(),
    normalizeVectorWasm,
    subtractVectorsWasm: vi.fn(),
  }))

  const vector = await import('@/lib/math/vector')
  return { normalize: vector.normalize, normalizeVectorWasm }
}

describe('normalize WASM semantics', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.doUnmock('@/lib/wasm')
    vi.restoreAllMocks()
  })

  it('throws for zero vectors before dispatching to WASM', async () => {
    const { normalize, normalizeVectorWasm } = await loadVectorWithWasm(
      () => new Float64Array([0, 0, 0])
    )

    expect(() => normalize([0, 0, 0])).toThrow('Cannot normalize zero vector')
    expect(normalizeVectorWasm).not.toHaveBeenCalled()
  })

  it('throws for near-zero vectors using the JS epsilon threshold', async () => {
    const { normalize, normalizeVectorWasm } = await loadVectorWithWasm(
      () => new Float64Array([1, 0, 0])
    )

    expect(() => normalize([EPSILON / 2, 0, 0])).toThrow('Cannot normalize zero vector')
    expect(normalizeVectorWasm).not.toHaveBeenCalled()
  })

  it('still uses WASM for normal vectors', async () => {
    const { normalize, normalizeVectorWasm } = await loadVectorWithWasm(
      () => new Float64Array([0.6, 0.8, 0])
    )

    expect(normalize([3, 4, 0])).toEqual([0.6, 0.8, 0])
    expect(normalizeVectorWasm).toHaveBeenCalledTimes(1)
  })
})
