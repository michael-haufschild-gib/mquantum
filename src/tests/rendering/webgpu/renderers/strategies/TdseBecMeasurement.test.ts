/**
 * Tests for TdseBecMeasurement helpers.
 *
 * getCurrentEigenstateEnergy reads from the diagnostics store.
 * handleMeasurement has deep GPU/async dependencies and is verified
 * by Playwright e2e tests — only the pure store-read path is tested here.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_TDSE_CONFIG, type TdseConfig } from '@/lib/geometry/extended/tdse'
import { executeFullMeasurement } from '@/lib/physics/measurementOrchestrator'
import {
  getCurrentEigenstateEnergy,
  handleMeasurement,
} from '@/rendering/webgpu/renderers/strategies/TdseBecMeasurement'
import { useDiagnosticsStore } from '@/stores/diagnostics/diagnosticsStore'
import { useMeasurementStore } from '@/stores/diagnostics/measurementStore'

vi.mock('@/lib/physics/measurementOrchestrator', () => ({
  executeFullMeasurement: vi.fn((_re, _im, _config, _width, inject, record) => {
    inject(new Float32Array([1]), new Float32Array([0]))
    record([0.25, 0.5, 0.75], 0.8, null)
  }),
  executePartialMeasurement: vi.fn(),
}))

describe('getCurrentEigenstateEnergy', () => {
  beforeEach(() => {
    // Reset to initial state before each test
    useDiagnosticsStore.setState(useDiagnosticsStore.getInitialState())
    useMeasurementStore.setState(useMeasurementStore.getInitialState())
    vi.clearAllMocks()
  })

  it('returns NaN when observables have no data', () => {
    // Initial state: hasData = false
    const energy = getCurrentEigenstateEnergy()
    expect(Number.isNaN(energy)).toBe(true)
  })

  it('returns totalEnergy when observables has data', () => {
    // Inject a fake observables snapshot with hasData = true
    useDiagnosticsStore.setState((state) => ({
      observables: {
        ...state.observables,
        hasData: true,
        totalEnergy: 3.14159,
      },
    }))
    const energy = getCurrentEigenstateEnergy()
    expect(energy).toBeCloseTo(3.14159, 5)
  })

  it('returns NaN after store is reset', () => {
    // Set some data then reset
    useDiagnosticsStore.setState((state) => ({
      observables: { ...state.observables, hasData: true, totalEnergy: 99 },
    }))
    expect(getCurrentEigenstateEnergy()).toBeCloseTo(99, 5)

    useDiagnosticsStore.setState(useDiagnosticsStore.getInitialState())
    expect(Number.isNaN(getCurrentEigenstateEnergy())).toBe(true)
  })

  it('returns zero energy when hasData is true and totalEnergy is 0', () => {
    useDiagnosticsStore.setState((state) => ({
      observables: { ...state.observables, hasData: true, totalEnergy: 0 },
    }))
    const energy = getCurrentEigenstateEnergy()
    expect(energy).toBe(0)
    expect(Number.isNaN(energy)).toBe(false)
  })

  it('returns negative energy value correctly', () => {
    useDiagnosticsStore.setState((state) => ({
      observables: { ...state.observables, hasData: true, totalEnergy: -7.5 },
    }))
    expect(getCurrentEigenstateEnergy()).toBeCloseTo(-7.5, 5)
  })

  it('collapses with sampled simTime, torus metric spacing, and unit target norm', async () => {
    const setLoadedWavefunction = vi.fn()
    const requestMeasurementReadback = vi.fn().mockResolvedValue({
      re: new Float32Array([1]),
      im: new Float32Array([0]),
      simTime: 12.5,
    })
    const tdsePass = {
      simTime: 99,
      requestMeasurementReadback,
      setLoadedWavefunction,
    }
    const config: TdseConfig = {
      ...DEFAULT_TDSE_CONFIG,
      latticeDim: 3,
      gridSize: [8, 8, 8],
      spacing: [0.1, 0.1, 0.1],
      metric: { kind: 'torus' as const, torusPeriod: [Math.PI, 2 * Math.PI, 4] },
    }

    useMeasurementStore.getState().setCollapseWidth(0.25)
    useMeasurementStore.getState().requestMeasurement([0, 0, 0])
    handleMeasurement({} as never, tdsePass as never, config)

    await vi.waitFor(() => expect(executeFullMeasurement).toHaveBeenCalled())

    const call = vi.mocked(executeFullMeasurement).mock.calls[0]!
    expect(call[2].time).toBe(12.5)
    expect(call[2].spacing[0]).toBeCloseTo(Math.PI / 8, 8)
    expect(call[2].spacing[1]).toBeCloseTo((2 * Math.PI) / 8, 8)
    expect(call[2].spacing[2]).toBeCloseTo(4 / 8, 8)
    expect(call[3]).toBe(0.25)
    expect(setLoadedWavefunction).toHaveBeenCalledWith(
      expect.any(Float32Array),
      expect.any(Float32Array),
      true,
      1.0
    )
    expect(useMeasurementStore.getState().measurements[0]?.position).toEqual([0.25, 0.5, 0.75])
  })
})
