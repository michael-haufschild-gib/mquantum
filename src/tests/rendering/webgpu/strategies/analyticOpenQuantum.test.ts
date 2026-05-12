import { beforeEach, describe, expect, it } from 'vitest'

import {
  DEFAULT_OPEN_QUANTUM_CONFIG,
  type OpenQuantumConfig,
} from '@/lib/physics/openQuantum/types'
import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import type { DensityGridComputePass } from '@/rendering/webgpu/passes/DensityGridComputePass'
import { AnalyticOpenQuantumExecutor } from '@/rendering/webgpu/renderers/strategies/analyticOpenQuantum'
import type {
  CachedPresetData,
  ModeFrameContext,
} from '@/rendering/webgpu/renderers/strategies/types'
import { useDiagnosticsStore } from '@/stores/diagnostics/diagnosticsStore'

function makePreset(seed: number, coefficients: [number, number][]): CachedPresetData {
  return {
    preset: {
      termCount: coefficients.length,
      coefficients,
      energies: coefficients.map((_, i) => i),
      quantumNumbers: coefficients.map((_, i) => [i]),
      omega: [1],
    },
    config: {
      presetName: 'regression',
      seed,
      termCount: coefficients.length,
      dimension: 3,
    },
  }
}

function makeShared(cachedPreset: CachedPresetData): ModeFrameContext {
  return {
    device: {} as GPUDevice,
    rendererConfig: {
      quantumMode: 'harmonicOscillator',
      dimension: 3,
      termCount: cachedPreset.preset.termCount as ModeFrameContext['rendererConfig']['termCount'],
      openQuantumEnabled: true,
    },
    schroedingerUniformData: new ArrayBuffer(16),
    basisUniformData: new Float32Array(16),
    schroedingerFloatView: new Float32Array(16),
    schroedingerIntView: new Int32Array(16),
    boundingRadius: 1,
    colorAlgorithm: 0,
    cachedPreset,
    rebuildObjectBindGroup: () => {},
  }
}

function makeGridPass(): DensityGridComputePass {
  return {
    updateOpenQuantumUniforms: () => {},
    updateHydrogenBasisUniforms: () => {},
  } as unknown as DensityGridComputePass
}

function makeContext(
  openQuantum?: Partial<OpenQuantumConfig>,
  isPlaying = true
): WebGPURenderContext {
  return {
    device: {} as GPUDevice,
    encoder: {} as GPUCommandEncoder,
    frame: {
      frameNumber: 1,
      delta: 1 / 60,
      time: 0,
      size: { width: 800, height: 600 },
      stores: {
        animation: { isPlaying },
        extended: {
          schroedinger: {
            openQuantum: {
              ...DEFAULT_OPEN_QUANTUM_CONFIG,
              enabled: true,
              dephasingEnabled: false,
              relaxationEnabled: false,
              thermalEnabled: false,
              ...openQuantum,
            },
          },
          schroedingerVersion: 1,
        },
      },
    },
    size: { width: 800, height: 600 },
    getTexture: () => null,
    getTextureView: () => null,
    getWriteTarget: () => null,
    getReadTextureView: () => null,
    getSampler: () => null,
    getResource: () => null,
    beginRenderPass: () => ({}),
  } as unknown as WebGPURenderContext
}

describe('AnalyticOpenQuantumExecutor — HO state/cache ordering', () => {
  beforeEach(() => {
    useDiagnosticsStore.getState().resetOpenQuantum()
  })

  it('publishes populations from the new same-size preset on the first changed frame', () => {
    const executor = new AnalyticOpenQuantumExecutor()
    const gridPass = makeGridPass()
    const ctx = makeContext()

    const groundPreset = makePreset(1, [
      [1, 0],
      [0, 0],
    ])
    const excitedPreset = makePreset(2, [
      [0, 0],
      [1, 0],
    ])

    executor.execute(ctx, makeShared(groundPreset), gridPass, 1, undefined)
    executor.execute(ctx, makeShared(groundPreset), gridPass, 1, undefined)
    executor.execute(ctx, makeShared(excitedPreset), gridPass, 2, undefined)

    const populations = useDiagnosticsStore.getState().openQuantum.populations
    expect(populations[0]).toBeCloseTo(0, 6)
    expect(populations[1]).toBeCloseTo(1, 6)
  })

  it('reinitializes from current coefficients before publishing after HO channel config changes', () => {
    const executor = new AnalyticOpenQuantumExecutor()
    const gridPass = makeGridPass()
    const excitedPreset = makePreset(1, [
      [0, 0],
      [1, 0],
    ])
    const relaxing = {
      relaxationEnabled: true,
      relaxationRate: 5,
      dt: 0.1,
      substeps: 10,
    }
    const noRelaxation = {
      relaxationEnabled: false,
      relaxationRate: 0,
      dt: 0.1,
      substeps: 10,
    }

    executor.execute(makeContext(relaxing), makeShared(excitedPreset), gridPass, 1, undefined)
    executor.execute(makeContext(relaxing), makeShared(excitedPreset), gridPass, 1, undefined)

    const decayed = useDiagnosticsStore.getState().openQuantum.populations
    expect(decayed[0]).toBeGreaterThan(0.9)

    executor.execute(makeContext(noRelaxation), makeShared(excitedPreset), gridPass, 2, undefined)

    const populations = useDiagnosticsStore.getState().openQuantum.populations
    expect(populations[0]).toBeCloseTo(0, 6)
    expect(populations[1]).toBeCloseTo(1, 6)
  })

  it('does not evolve or append repeated diagnostics while global time evolution is paused', () => {
    const executor = new AnalyticOpenQuantumExecutor()
    const gridPass = makeGridPass()
    const excitedPreset = makePreset(1, [
      [0, 0],
      [1, 0],
    ])
    const relaxing = {
      relaxationEnabled: true,
      relaxationRate: 5,
      dt: 0.1,
      substeps: 10,
    }

    executor.execute(
      makeContext(relaxing, false),
      makeShared(excitedPreset),
      gridPass,
      1,
      undefined
    )

    const firstPaused = useDiagnosticsStore.getState().openQuantum
    expect(firstPaused.populations[0]).toBeCloseTo(0, 6)
    expect(firstPaused.populations[1]).toBeCloseTo(1, 6)
    expect(firstPaused.historyCount).toBe(1)

    executor.execute(
      makeContext(relaxing, false),
      makeShared(excitedPreset),
      gridPass,
      1,
      undefined
    )

    const secondPaused = useDiagnosticsStore.getState().openQuantum
    expect(secondPaused.populations[0]).toBeCloseTo(0, 6)
    expect(secondPaused.populations[1]).toBeCloseTo(1, 6)
    expect(secondPaused.historyCount).toBe(1)

    executor.execute(makeContext(relaxing, true), makeShared(excitedPreset), gridPass, 1, undefined)

    const resumed = useDiagnosticsStore.getState().openQuantum
    expect(resumed.populations[0]).toBeGreaterThan(0.9)
    expect(resumed.populations[1]).toBeLessThan(0.1)
    expect(resumed.historyCount).toBe(2)
  })
})
