import { beforeEach, describe, expect, it } from 'vitest'

import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import {
  type SinglePassComputePass,
  SinglePassComputeStrategy,
  type SinglePassFrameArgs,
} from '@/rendering/webgpu/renderers/strategies/SinglePassComputeStrategy'
import type { ModeFrameContext } from '@/rendering/webgpu/renderers/strategies/types'
import { useSimulationStateStore } from '@/stores/runtime/simulationStateStore'

interface TestConfig {
  needsReset?: boolean
  absorberEnabled?: boolean
  absorberWidth?: number
  pmlTargetReflection?: number
}

class FakePass implements SinglePassComputePass {
  getDensityGridSize(): number {
    return 16
  }

  initializeDensityTexture(): void {}

  getDensityTextureView(): null {
    return null
  }

  dispose(): void {}

  requestStateSave(): boolean {
    return false
  }

  setLoadedWavefunction(): void {}
}

class TestStrategy extends SinglePassComputeStrategy<FakePass, TestConfig> {
  readonly executeArgs: SinglePassFrameArgs[] = []
  readonly afterArgs: SinglePassFrameArgs[] = []

  installPass(): void {
    this.pass = new FakePass()
  }

  protected createPass(): FakePass {
    return new FakePass()
  }

  protected getConfig(): TestConfig {
    return { absorberEnabled: true, absorberWidth: 0.2, pmlTargetReflection: 1e-6 }
  }

  protected get stateIOModeKeys(): string[] {
    return ['testMode']
  }

  protected get configSubKey(): string {
    return 'test'
  }

  protected executePass(
    _pass: FakePass,
    _ctx: WebGPURenderContext,
    _config: TestConfig,
    args: SinglePassFrameArgs
  ): void {
    this.executeArgs.push(args)
  }

  protected override afterExecute(
    _ctx: WebGPURenderContext,
    _pass: FakePass,
    _config: TestConfig,
    args: SinglePassFrameArgs
  ): void {
    this.afterArgs.push(args)
  }
}

function makeContext(isPlaying: boolean, speed: number): WebGPURenderContext {
  return {
    frame: {
      stores: {
        extended: { schroedinger: {} },
        animation: { isPlaying, speed },
      },
    },
  } as unknown as WebGPURenderContext
}

function makeShared(boundingRadius: number, colorAlgorithm: number): ModeFrameContext {
  return { boundingRadius, colorAlgorithm } as ModeFrameContext
}

describe('SinglePassComputeStrategy frame args reuse', () => {
  beforeEach(() => {
    useSimulationStateStore.setState(useSimulationStateStore.getInitialState())
  })

  it('reuses one args object for execute and afterExecute across frames', () => {
    const strategy = new TestStrategy()
    strategy.installPass()

    strategy.executeFrame(makeContext(true, 2), makeShared(3, 7))
    strategy.executeFrame(makeContext(false, 0.5), makeShared(4, 9))

    expect(strategy.executeArgs).toHaveLength(2)
    expect(strategy.afterArgs).toHaveLength(2)
    expect(strategy.afterArgs[0]).toBe(strategy.executeArgs[0])
    expect(strategy.executeArgs[1]).toBe(strategy.executeArgs[0])
    expect(strategy.afterArgs[1]).toBe(strategy.executeArgs[0])
    expect(strategy.executeArgs[0]!.isPlaying).toBe(false)
    expect(strategy.executeArgs[0]!.speed).toBe(0.5)
    expect(strategy.executeArgs[0]!.boundingRadius).toBe(4)
    expect(strategy.executeArgs[0]!.colorAlgorithm).toBe(9)
  })
})
