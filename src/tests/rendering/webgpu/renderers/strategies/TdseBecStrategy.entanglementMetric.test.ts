import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_TDSE_CONFIG } from '@/lib/geometry/extended/tdse'
import type { TdseConfig } from '@/lib/geometry/extended/types'
import { TdseBecStrategy } from '@/rendering/webgpu/renderers/strategies/TdseBecStrategy'
import { useCoordinateEntanglementStore } from '@/stores/coordinateEntanglementStore'

describe('TdseBecStrategy coordinate entanglement metric gate', () => {
  beforeEach(() => {
    useCoordinateEntanglementStore.setState(useCoordinateEntanglementStore.getInitialState())
    useCoordinateEntanglementStore.getState().setEnabled(true)
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
})
