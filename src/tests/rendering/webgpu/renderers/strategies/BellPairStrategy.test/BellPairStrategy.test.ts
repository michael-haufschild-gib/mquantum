import { describe, expect, it, vi } from 'vitest'

import { createDefaultBellPairConfig } from '@/lib/geometry/extended/bellPair'
import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import { BellPairStrategy } from '@/rendering/webgpu/renderers/strategies/BellPairStrategy'
import type { SinglePassFrameArgs } from '@/rendering/webgpu/renderers/strategies/SinglePassComputeStrategy'
import { useBellExperimentStore } from '@/stores/diagnostics/bellExperimentStore'

class TestBellPairStrategy extends BellPairStrategy {
  runForTest(config: ReturnType<typeof createDefaultBellPairConfig>, isPlaying = false): void {
    const pass = { executeBellPair: vi.fn() }
    this.executePass(pass as never, {} as WebGPURenderContext, config, {
      isPlaying,
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

  // Regression: targetTrials was never consumed, so the loop ran until paused.
  it('stops the trial loop at targetTrials, clamping the last batch', () => {
    const cfg = {
      ...createDefaultBellPairConfig(),
      needsReset: false,
      targetTrials: 2500,
      trialsPerFrame: 1000,
    }
    useBellExperimentStore.getState().reset(7)
    useBellExperimentStore.getState().setIsRunning(true)
    const strategy = new TestBellPairStrategy()
    for (let f = 0; f < 5; f++) strategy.runForTest(cfg, true)
    const s = useBellExperimentStore.getState()
    expect(s.totalTrials).toBe(2500)
    expect(s.isRunning).toBe(false)
  })
})
