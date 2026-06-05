import { describe, expect, it } from 'vitest'

import { DENSITY_GRID_SIZE } from '@/constants/densityGrid'
import type { WebGPURenderContext, WebGPUSetupContext } from '@/rendering/webgpu/core/types'
import type {
  ExtendedStoreSnapshot,
  SchrodingerRendererConfig,
} from '@/rendering/webgpu/renderers/schrodingerRendererTypes'
import type { StateSaveLoadPass } from '@/rendering/webgpu/renderers/strategies/computeGridUtils'
import {
  type SinglePassComputePass,
  SinglePassComputeStrategy,
  type SinglePassFrameArgs,
} from '@/rendering/webgpu/renderers/strategies/SinglePassComputeStrategy'
import type { ModeSetupResult } from '@/rendering/webgpu/renderers/strategies/types'

class FakePass implements SinglePassComputePass, StateSaveLoadPass {
  disposed = false

  constructor(private readonly size: number) {}

  getDensityGridSize(): number {
    return this.size
  }

  initializeDensityTexture(_device: GPUDevice): void {
    // no-op
  }

  getDensityTextureView(): GPUTextureView | null {
    return null
  }

  dispose(): void {
    this.disposed = true
  }

  requestStateSave(_ctx: WebGPURenderContext): boolean {
    return false
  }

  setLoadedWavefunction(_re: Float32Array, _im: Float32Array): void {
    // no-op
  }
}

class FakeStrategy extends SinglePassComputeStrategy<FakePass, { needsReset?: boolean }> {
  createdSizes: number[] = []

  protected createPass(densityGridResolution: number): FakePass {
    this.createdSizes.push(densityGridResolution)
    return new FakePass(densityGridResolution)
  }

  protected getConfig(_extended: ExtendedStoreSnapshot | undefined): { needsReset?: boolean } {
    return {}
  }

  protected get stateIOModeKeys(): string[] {
    return ['fake']
  }

  protected get configSubKey(): string {
    return 'fake'
  }

  protected executePass(
    _pass: FakePass,
    _ctx: WebGPURenderContext,
    _config: { needsReset?: boolean },
    _args: SinglePassFrameArgs
  ): void {
    // no-op
  }
}

function setup(strategy: FakeStrategy, config: SchrodingerRendererConfig): ModeSetupResult {
  return strategy.setup(
    {
      device: {} as GPUDevice,
      format: 'bgra8unorm',
      capabilities: {
        maxTextureDimension2D: 4096,
        maxStorageBufferBindingSize: 134217728,
        maxUniformBufferBindingSize: 65536,
        maxComputeWorkgroupSizeX: 256,
        maxComputeWorkgroupSizeY: 256,
        maxComputeWorkgroupSizeZ: 64,
        maxComputeInvocationsPerWorkgroup: 256,
        maxBindGroups: 4,
        timestampQuery: false,
        adapterInfo: 'test',
      },
      createSampler: () => ({}) as GPUSampler,
      registerBindGroupLayout: () => {},
      getBindGroupLayout: () => null,
    } satisfies WebGPUSetupContext,
    config
  )
}

describe('SinglePassComputeStrategy density grid setup', () => {
  it('uses the shared density grid default when renderer config omits densityGridResolution', () => {
    const strategy = new FakeStrategy()

    setup(strategy, {} as SchrodingerRendererConfig)

    expect(strategy.createdSizes).toEqual([DENSITY_GRID_SIZE])
  })

  it('does not rebuild an existing default-sized pass on repeated omitted config', () => {
    const strategy = new FakeStrategy()

    setup(strategy, {} as SchrodingerRendererConfig)
    setup(strategy, {} as SchrodingerRendererConfig)

    expect(strategy.createdSizes).toEqual([DENSITY_GRID_SIZE])
  })
})
