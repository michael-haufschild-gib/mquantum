import { describe, expect, it, vi } from 'vitest'

import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import { SCHROEDINGER_LAYOUT } from '@/rendering/webgpu/renderers/schroedingerLayout'
import { AnalyticModeStrategy } from '@/rendering/webgpu/renderers/strategies/AnalyticModeStrategy'
import type { ModeFrameContext } from '@/rendering/webgpu/renderers/strategies/types'

const I = SCHROEDINGER_LAYOUT.index

type WignerCacheExecutor = {
  executeWignerCache(ctx: WebGPURenderContext, shared: ModeFrameContext): void
}

type StrategyInternals = {
  wignerCachePass: WignerPassMock
  wignerCacheInitialized: boolean
  lastWignerCacheResolution: number
}

type WignerPassMock = {
  resize: ReturnType<typeof vi.fn>
  updateSchroedingerUniforms: ReturnType<typeof vi.fn>
  updateBasisUniforms: ReturnType<typeof vi.fn>
  updateGridParams: ReturnType<typeof vi.fn>
  updateTimeOnly: ReturnType<typeof vi.fn>
  needsUpdate: ReturnType<typeof vi.fn>
  isTwoPhaseActive: ReturnType<typeof vi.fn>
  updateReconstructParams: ReturnType<typeof vi.fn>
  executeSpatial: ReturnType<typeof vi.fn>
  executeReconstruct: ReturnType<typeof vi.fn>
  getCacheTextureView: ReturnType<typeof vi.fn>
  getCacheSampler: ReturnType<typeof vi.fn>
}

function makeWignerPass(): WignerPassMock {
  return {
    resize: vi.fn(() => false),
    updateSchroedingerUniforms: vi.fn(),
    updateBasisUniforms: vi.fn(),
    updateGridParams: vi.fn(),
    updateTimeOnly: vi.fn(),
    needsUpdate: vi.fn(() => ({ spatial: false, reconstruct: true })),
    isTwoPhaseActive: vi.fn(() => true),
    updateReconstructParams: vi.fn(),
    executeSpatial: vi.fn(),
    executeReconstruct: vi.fn(),
    getCacheTextureView: vi.fn(() => null),
    getCacheSampler: vi.fn(() => null),
  }
}

function makeShared(): ModeFrameContext {
  const uniformData = new ArrayBuffer(2048)
  const floatView = new Float32Array(uniformData)
  const intView = new Int32Array(uniformData)
  floatView[I.wignerXRange] = 4
  floatView[I.wignerPRange] = 5
  floatView[I.timeScale] = 0.25
  intView[I.wignerDimensionIndex] = 0

  return {
    device: {} as GPUDevice,
    rendererConfig: {
      dimension: 3,
      quantumMode: 'harmonicOscillator',
      representation: 'wigner',
      termCount: 3,
    },
    schroedingerUniformData: uniformData,
    basisUniformData: new Float32Array(64),
    schroedingerFloatView: floatView,
    schroedingerIntView: intView,
    boundingRadius: 1,
    colorAlgorithm: 0,
    cachedPreset: null,
    rebuildObjectBindGroup: vi.fn(),
  }
}

function makeCtx(): WebGPURenderContext {
  return {
    device: {} as GPUDevice,
    encoder: {} as GPUCommandEncoder,
    size: { width: 800, height: 400 },
    frame: {
      time: 99,
      delta: 0.016,
      frameNumber: 1,
      stores: {
        animation: { isPlaying: true, accumulatedTime: 12.5 },
        extended: {
          schroedingerVersion: 7,
          schroedinger: {
            wignerCacheResolution: 256,
            wignerCrossTermsEnabled: true,
            sliceAnimationEnabled: false,
          },
        },
        rotation: { version: 3 },
        geometry: { dimension: 3 },
      },
    },
    getTexture: vi.fn(),
    getTextureView: vi.fn(),
    getWriteTarget: vi.fn(),
    getReadTextureView: vi.fn(),
    getSampler: vi.fn(),
    getResource: vi.fn(),
    beginRenderPass: vi.fn(),
    beginComputePass: vi.fn(),
    getCanvasView: vi.fn(),
  } as unknown as WebGPURenderContext
}

describe('AnalyticModeStrategy Wigner cache', () => {
  it('uses animation.accumulatedTime, not raw frame.time, for Wigner cache phases', () => {
    const strategy = new AnalyticModeStrategy()
    const wignerPass = makeWignerPass()
    const internals = strategy as unknown as StrategyInternals
    internals.wignerCachePass = wignerPass
    internals.wignerCacheInitialized = true
    internals.lastWignerCacheResolution = 256
    ;(strategy as unknown as WignerCacheExecutor).executeWignerCache(makeCtx(), makeShared())

    expect(wignerPass.updateTimeOnly).toHaveBeenCalledWith(expect.anything(), 12.5)
    expect(wignerPass.updateReconstructParams).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(ArrayBuffer),
      12.5,
      0.25,
      true
    )
  })
})
