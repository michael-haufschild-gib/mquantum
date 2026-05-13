import { beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_OPEN_QUANTUM_CONFIG } from '@/lib/physics/openQuantum/types'
import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import type { DensityGridComputePass } from '@/rendering/webgpu/passes/DensityGridComputePass'
import { AnalyticOpenQuantumExecutor } from '@/rendering/webgpu/renderers/strategies/analyticOpenQuantum'
import type { ModeFrameContext } from '@/rendering/webgpu/renderers/strategies/types'
import { useDiagnosticsStore } from '@/stores/diagnostics/diagnosticsStore'

const MAX_K = 14

interface PresetConfig {
  presetName: string
  seed: number
  termCount: number
  maxQuantumNumber: number
  frequencySpread: number
  dimension: number
}

function rhoIndex(row: number, col: number): number {
  return 2 * (row * MAX_K + col)
}

function offDiagonalMagnitude(upload: Float32Array): number {
  const re = upload[rhoIndex(0, 1)]!
  const im = upload[rhoIndex(0, 1) + 1]!
  return Math.hypot(re, im)
}

function makePreset(coefficients: [number, number][], energies = [0, 1]) {
  return {
    termCount: coefficients.length,
    coefficients,
    energies,
    quantumNumbers: coefficients.map((_, i) => [i]),
    omega: [1],
  }
}

function makePresetConfig(overrides: Partial<PresetConfig> = {}): PresetConfig {
  return {
    presetName: 'custom',
    seed: 1,
    termCount: 2,
    maxQuantumNumber: 2,
    frequencySpread: 0.01,
    dimension: 1,
    ...overrides,
  }
}

function makeCtx(openQuantum: typeof DEFAULT_OPEN_QUANTUM_CONFIG): WebGPURenderContext {
  return {
    frame: {
      stores: {
        extended: {
          schroedinger: { openQuantum },
        },
      },
    },
  } as unknown as WebGPURenderContext
}

function makeShared(preset: ReturnType<typeof makePreset>, config: PresetConfig): ModeFrameContext {
  return {
    device: {},
    rendererConfig: { quantumMode: 'harmonicOscillator', dimension: 1 },
    cachedPreset: { preset, config },
  } as unknown as ModeFrameContext
}

function makeGridPass() {
  const uploads: Float32Array[] = []
  return {
    uploads,
    gridPass: {
      updateOpenQuantumUniforms: (_device: GPUDevice, data: Float32Array) => {
        uploads.push(Float32Array.from(data))
      },
      updateHydrogenBasisUniforms: () => {},
    } as unknown as DensityGridComputePass,
  }
}

describe('AnalyticOpenQuantumExecutor', () => {
  beforeEach(() => {
    useDiagnosticsStore.getState().resetOpenQuantum()
  })

  it('does not reset HO density matrix when only generator settings change', () => {
    const executor = new AnalyticOpenQuantumExecutor()
    const { gridPass, uploads } = makeGridPass()
    const c = 1 / Math.sqrt(2)
    const preset = makePreset([
      [c, 0],
      [c, 0],
    ])
    const config = makePresetConfig()

    const decohering = {
      ...DEFAULT_OPEN_QUANTUM_CONFIG,
      enabled: true,
      dt: 0.1,
      substeps: 10,
      dephasingEnabled: true,
      dephasingRate: 5,
      relaxationEnabled: false,
      thermalEnabled: false,
    }

    executor.execute(makeCtx(decohering), makeShared(preset, config), gridPass, 1, undefined)
    executor.execute(makeCtx(decohering), makeShared(preset, config), gridPass, 2, undefined)
    const decohered = offDiagonalMagnitude(uploads.at(-1)!)
    expect(decohered).toBeLessThan(0.01)

    const generatorOnlyChange = {
      ...decohering,
      dephasingEnabled: false,
      thermalUpRate: 1,
    }

    executor.execute(
      makeCtx(generatorOnlyChange),
      makeShared(preset, config),
      gridPass,
      3,
      undefined
    )
    executor.execute(
      makeCtx(generatorOnlyChange),
      makeShared(preset, config),
      gridPass,
      4,
      undefined
    )

    expect(offDiagonalMagnitude(uploads.at(-1)!)).toBeLessThan(0.01)
  })
})
