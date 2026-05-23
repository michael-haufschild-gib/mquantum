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

function makeHydrogenCtx(
  openQuantum: typeof DEFAULT_OPEN_QUANTUM_CONFIG,
  extraDimOmega: readonly number[],
  extraDimFrequencySpread: number
): WebGPURenderContext {
  return {
    frame: {
      stores: {
        extended: {
          schroedinger: {
            openQuantum,
            extraDimOmega,
            extraDimFrequencySpread,
            principalQuantumNumber: 1,
            azimuthalQuantumNumber: 0,
            magneticQuantumNumber: 0,
          },
        },
      },
    },
  } as unknown as WebGPURenderContext
}

function makeShared(
  preset: ReturnType<typeof makePreset>,
  config: PresetConfig,
  rendererConfig: Partial<ModeFrameContext['rendererConfig']> = {}
): ModeFrameContext {
  return {
    device: {},
    rendererConfig: { quantumMode: 'harmonicOscillator', dimension: 1, ...rendererConfig },
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

  it('normalizes malformed hydrogen basis inputs before executor allocation', () => {
    const executor = new AnalyticOpenQuantumExecutor()
    const { gridPass, uploads } = makeGridPass()
    const preset = makePreset([[1, 0]])
    const config = makePresetConfig()
    const malformedHydrogen = {
      ...DEFAULT_OPEN_QUANTUM_CONFIG,
      enabled: true,
      hydrogenBasisMaxN: Infinity,
    }
    const ctx = {
      frame: {
        stores: {
          extended: {
            schroedinger: {
              openQuantum: malformedHydrogen,
              extraDimOmega: 'not-an-array',
            },
          },
        },
      },
    } as unknown as WebGPURenderContext

    expect(() =>
      executor.execute(
        ctx,
        makeShared(preset, config, { quantumMode: 'hydrogenND', dimension: Infinity }),
        gridPass,
        1,
        undefined
      )
    ).not.toThrow()
    expect(uploads).toHaveLength(1)
  })

  it('rebuilds hydrogen open-quantum basis from spread-adjusted shader frequencies', () => {
    const executor = new AnalyticOpenQuantumExecutor()
    const { gridPass } = makeGridPass()
    const preset = makePreset([[1, 0]])
    const config = makePresetConfig()
    const openQuantum = {
      ...DEFAULT_OPEN_QUANTUM_CONFIG,
      enabled: true,
      hydrogenBasisMaxN: 1,
    }
    const shared = makeShared(preset, config, { quantumMode: 'hydrogenND', dimension: 5 })
    const state = executor as unknown as {
      hydrogenBasisKey: string
      hydrogenBasis: { energy: number }[]
    }

    executor.execute(makeHydrogenCtx(openQuantum, [2, 2], 0), shared, gridPass, 1, undefined)
    const baseKey = state.hydrogenBasisKey
    const baseEnergy = state.hydrogenBasis[0]!.energy

    executor.execute(makeHydrogenCtx(openQuantum, [2, 2], 0.1), shared, gridPass, 2, undefined)

    expect(state.hydrogenBasisKey).not.toBe(baseKey)
    expect(state.hydrogenBasis[0]!.energy).toBeCloseTo(1.275, 10)
    expect(state.hydrogenBasis[0]!.energy).not.toBeCloseTo(baseEnergy, 10)
  })

  it('sanitizes malformed open-quantum runtime config before propagator creation', () => {
    const executor = new AnalyticOpenQuantumExecutor()
    const { gridPass, uploads } = makeGridPass()
    const preset = makePreset([
      [1, 0],
      [0, 0],
    ])
    const config = makePresetConfig()
    const malformedConfig = {
      ...DEFAULT_OPEN_QUANTUM_CONFIG,
      enabled: true,
      dt: Infinity,
      substeps: NaN,
      dephasingRate: NaN,
      relaxationRate: Infinity,
      thermalUpRate: -1,
      dephasingEnabled: true,
      relaxationEnabled: true,
      thermalEnabled: true,
      visualizationMode: 'phase',
      dephasingModel: 'bogus',
    } as unknown as typeof DEFAULT_OPEN_QUANTUM_CONFIG

    expect(() =>
      executor.execute(makeCtx(malformedConfig), makeShared(preset, config), gridPass, 1, undefined)
    ).not.toThrow()
    expect(uploads).toHaveLength(1)
  })
})
