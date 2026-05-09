import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_TDSE_CONFIG } from '@/lib/geometry/extended/tdse'
import type { TdseConfig } from '@/lib/geometry/extended/types'
import type { CoordinateEntanglementResult } from '@/lib/physics/coordinateEntanglement'
import { TdseBecStrategy } from '@/rendering/webgpu/renderers/strategies/TdseBecStrategy'
import { useCoordinateEntanglementStore } from '@/stores/coordinateEntanglementStore'

class MockWorker {
  static instances: MockWorker[] = []

  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  postMessage = vi.fn()
  terminate = vi.fn()

  constructor() {
    MockWorker.instances.push(this)
  }
}

function makeEntanglementResult(
  overrides: Partial<CoordinateEntanglementResult> = {}
): CoordinateEntanglementResult {
  return {
    entropies: [0.4, 0.2],
    averageEntropy: 0.3,
    normalizedEntropy: 0.5,
    maxEntropies: [0.69, 0.69],
    bipartitionEntropies: [],
    mutualInfo: null,
    spectrum: [0.8, 0.2],
    wignerNegativities: [null, null],
    averageWignerNegativity: 0,
    ...overrides,
  }
}

describe('TdseBecStrategy coordinate entanglement metric gate', () => {
  beforeEach(() => {
    MockWorker.instances = []
    vi.stubGlobal('Worker', MockWorker)
    useCoordinateEntanglementStore.setState(useCoordinateEntanglementStore.getInitialState())
    useCoordinateEntanglementStore.getState().setEnabled(true)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not read back or compute coordinate entanglement for non-flat metrics', () => {
    const strategy = new TdseBecStrategy()
    const requestMeasurementReadback = vi.fn()
    const config: TdseConfig = {
      ...DEFAULT_TDSE_CONFIG,
      metric: { kind: 'morrisThorne', throatRadius: 0.5 },
    }

    ;(
      strategy as unknown as {
        entanglementFrameCounter: number
        maybeComputeEntanglement: (ctx: unknown, pass: unknown, config: TdseConfig) => void
      }
    ).entanglementFrameCounter = 999
    ;(
      strategy as unknown as {
        maybeComputeEntanglement: (ctx: unknown, pass: unknown, config: TdseConfig) => void
      }
    ).maybeComputeEntanglement({}, { requestMeasurementReadback }, config)

    expect(requestMeasurementReadback).not.toHaveBeenCalled()
  })

  it('discards worker results if coordinate entanglement was disabled while in flight', async () => {
    const strategy = new TdseBecStrategy()
    const requestMeasurementReadback = vi.fn().mockResolvedValue({
      re: new Float32Array([1, 0, 0, 0]),
      im: new Float32Array(4),
    })

    ;(
      strategy as unknown as {
        entanglementFrameCounter: number
        maybeComputeEntanglement: (ctx: unknown, pass: unknown, config: TdseConfig) => void
      }
    ).entanglementFrameCounter = 999
    ;(
      strategy as unknown as {
        maybeComputeEntanglement: (ctx: unknown, pass: unknown, config: TdseConfig) => void
      }
    ).maybeComputeEntanglement(
      {},
      { requestMeasurementReadback },
      { ...DEFAULT_TDSE_CONFIG, gridSize: [2, 2], latticeDim: 2 }
    )

    await vi.waitFor(() => expect(MockWorker.instances[0]?.postMessage).toHaveBeenCalled())

    useCoordinateEntanglementStore.getState().setEnabled(false)
    MockWorker.instances[0]!.onmessage?.({
      data: {
        type: 'result',
        epoch: 1,
        result: makeEntanglementResult({ averageEntropy: 0.9 }),
      },
    } as MessageEvent)

    expect(useCoordinateEntanglementStore.getState().historyCount).toBe(0)
    expect(useCoordinateEntanglementStore.getState().currentAverageEntropy).toBe(0)
  })

  it('uses latest diagnostic options when readback resolves after toggles changed', async () => {
    const strategy = new TdseBecStrategy()
    let resolveReadback: (value: { re: Float32Array; im: Float32Array }) => void = () => {}
    const readbackPromise = new Promise<{ re: Float32Array; im: Float32Array }>((resolve) => {
      resolveReadback = resolve
    })
    const requestMeasurementReadback = vi.fn().mockReturnValue(readbackPromise)

    ;(
      strategy as unknown as {
        entanglementFrameCounter: number
        maybeComputeEntanglement: (ctx: unknown, pass: unknown, config: TdseConfig) => void
      }
    ).entanglementFrameCounter = 999
    ;(
      strategy as unknown as {
        maybeComputeEntanglement: (ctx: unknown, pass: unknown, config: TdseConfig) => void
      }
    ).maybeComputeEntanglement(
      {},
      { requestMeasurementReadback },
      { ...DEFAULT_TDSE_CONFIG, gridSize: [2, 2], latticeDim: 2 }
    )

    const store = useCoordinateEntanglementStore.getState()
    store.setComputePairwiseMI(true)
    store.setComputeBipartitions(true)
    store.setComputeWignerNegativity(true)
    resolveReadback({ re: new Float32Array([1, 0, 0, 0]), im: new Float32Array(4) })

    await vi.waitFor(() => expect(MockWorker.instances[0]?.postMessage).toHaveBeenCalled())

    const request = MockWorker.instances[0]!.postMessage.mock.calls[0]![0] as {
      options: {
        computePairwiseMI: boolean
        computeBipartitions: boolean
        computeWignerNegativity: boolean
      }
    }
    expect(request.options).toEqual({
      computePairwiseMI: true,
      computeBipartitions: true,
      computeWignerNegativity: true,
    })
  })
})
