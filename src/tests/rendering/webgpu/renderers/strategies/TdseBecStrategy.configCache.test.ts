import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type BecConfig, DEFAULT_BEC_CONFIG } from '@/lib/geometry/extended/bec'
import type { TdseConfig } from '@/lib/geometry/extended/tdse'
import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import { TdseBecStrategy } from '@/rendering/webgpu/renderers/strategies/TdseBecStrategy'
import type { ModeFrameContext } from '@/rendering/webgpu/renderers/strategies/types'
import { useDiagnosticsStore } from '@/stores/diagnostics/diagnosticsStore'
import { useMeasurementStore } from '@/stores/diagnostics/measurementStore'
import { useWavefunctionSliceStore } from '@/stores/diagnostics/wavefunctionSliceStore'
import { useSimulationStateStore } from '@/stores/runtime/simulationStateStore'

class FakeTdsePass {
  readonly executedConfigs: TdseConfig[] = []

  getDensityTextureView(): GPUTextureView {
    return { label: 'fake-density-view' } as GPUTextureView
  }

  executeTDSE(
    _ctx: WebGPURenderContext,
    config: TdseConfig,
    _isPlaying: boolean,
    _speed: number
  ): void {
    this.executedConfigs.push(config)
  }

  getDiagnostics(): null {
    return null
  }

  requestStateSave(): boolean {
    return false
  }

  setLoadedWavefunction(): void {}

  requestSliceCapture(): boolean {
    return false
  }

  requestMeasurementReadback(): Promise<null> {
    return Promise.resolve(null)
  }

  storeCurrentEigenstate(): number {
    return -1
  }

  getStoredEigenstateCount(): number {
    return 0
  }
}

function makeBec(overrides: Partial<BecConfig> = {}): BecConfig {
  return {
    ...DEFAULT_BEC_CONFIG,
    gridSize: [...DEFAULT_BEC_CONFIG.gridSize],
    spacing: [...DEFAULT_BEC_CONFIG.spacing],
    trapAnisotropy: [...DEFAULT_BEC_CONFIG.trapAnisotropy],
    compactDims: [...DEFAULT_BEC_CONFIG.compactDims],
    compactRadii: [...DEFAULT_BEC_CONFIG.compactRadii],
    slicePositions: [...DEFAULT_BEC_CONFIG.slicePositions],
    ...overrides,
  }
}

function makeContext(
  bec: BecConfig,
  clearComputeNeedsReset = vi.fn(),
  version = 7
): WebGPURenderContext {
  return {
    frame: {
      stores: {
        extended: {
          schroedingerVersion: version,
          clearComputeNeedsReset,
          schroedinger: {
            quantumMode: 'becDynamics',
            bec,
          },
        },
        animation: { isPlaying: false, speed: 1 },
        appearance: { colorAlgorithm: 'phaseDensity' },
      },
    },
  } as unknown as WebGPURenderContext
}

function installFakePass(strategy: TdseBecStrategy): FakeTdsePass {
  const pass = new FakeTdsePass()
  ;(strategy as unknown as { tdsePass: FakeTdsePass }).tdsePass = pass
  return pass
}

const SHARED = { boundingRadius: 2 } as ModeFrameContext

describe('TdseBecStrategy BEC config cache', () => {
  beforeEach(() => {
    useDiagnosticsStore.setState(useDiagnosticsStore.getInitialState())
    useMeasurementStore.setState(useMeasurementStore.getInitialState())
    useWavefunctionSliceStore.setState(useWavefunctionSliceStore.getInitialState())
    useSimulationStateStore.setState(useSimulationStateStore.getInitialState())
  })

  it('reuses the TDSE config object when unchanged BEC state renders consecutive frames', () => {
    const strategy = new TdseBecStrategy()
    const pass = installFakePass(strategy)
    const ctx = makeContext(makeBec())

    strategy.executeFrame(ctx, SHARED)
    strategy.executeFrame(ctx, SHARED)

    expect(pass.executedConfigs).toHaveLength(2)
    expect(pass.executedConfigs[1]).toBe(pass.executedConfigs[0])
  })

  it('refreshes the cached config when needsReset is cleared without a version bump', () => {
    const strategy = new TdseBecStrategy()
    const pass = installFakePass(strategy)
    const bec = makeBec({ needsReset: true })
    const clearReset = vi.fn(() => {
      bec.needsReset = false
    })
    const ctx = makeContext(bec, clearReset)

    strategy.executeFrame(ctx, SHARED)
    strategy.executeFrame(ctx, SHARED)

    expect(clearReset).toHaveBeenCalledWith('bec')
    expect(pass.executedConfigs).toHaveLength(2)
    expect(pass.executedConfigs[1]).not.toBe(pass.executedConfigs[0])
    expect(pass.executedConfigs[0]!.needsReset).toBe(true)
    expect(pass.executedConfigs[1]!.needsReset).toBe(false)
  })
})
