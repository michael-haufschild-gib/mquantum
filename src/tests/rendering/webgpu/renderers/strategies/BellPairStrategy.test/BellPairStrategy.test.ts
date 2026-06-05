import { describe, expect, it, vi } from 'vitest'

import { createDefaultBellPairConfig } from '@/lib/geometry/extended/bellPair'
import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import { BellPairStrategy } from '@/rendering/webgpu/renderers/strategies/BellPairStrategy'
import type { SinglePassFrameArgs } from '@/rendering/webgpu/renderers/strategies/SinglePassComputeStrategy'
import { useBellExperimentStore } from '@/stores/diagnostics/bellExperimentStore'

class TestBellPairStrategy extends BellPairStrategy {
  runForTest(config: ReturnType<typeof createDefaultBellPairConfig>): void {
    const pass = { executeBellPair: vi.fn() }
    this.executePass(pass as never, {} as WebGPURenderContext, config, {
      isPlaying: false,
      speed: 1,
      boundingRadius: 2,
    } as SinglePassFrameArgs)
  }
}

describe('BellPairStrategy', () => {
  it('resets diagnostic RNG/statistics when Bell config needsReset is set', () => {
    const cfg = createDefaultBellPairConfig()
    useBellExperimentStore.getState().reset(7)
    useBellExperimentStore.getState().processTrialBatch(cfg, 1000)
    expect(useBellExperimentStore.getState().totalTrials).toBe(1000)

    new TestBellPairStrategy().runForTest({ ...cfg, seed: 123, needsReset: true })

    const s = useBellExperimentStore.getState()
    expect(s.seed).toBe(123)
    expect(s.totalTrials).toBe(0)
    expect(s.historyCount).toBe(0)
    expect(s.qm.S).toBeNaN()
  })
})
