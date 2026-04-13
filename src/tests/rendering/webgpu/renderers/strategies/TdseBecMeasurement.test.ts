/**
 * Tests for TdseBecMeasurement helpers.
 *
 * getCurrentEigenstateEnergy reads from the diagnostics store.
 * handleMeasurement has deep GPU/async dependencies and is verified
 * by Playwright e2e tests — only the pure store-read path is tested here.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { getCurrentEigenstateEnergy } from '@/rendering/webgpu/renderers/strategies/TdseBecMeasurement'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'

describe('getCurrentEigenstateEnergy', () => {
  beforeEach(() => {
    // Reset to initial state before each test
    useDiagnosticsStore.setState(useDiagnosticsStore.getInitialState())
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
})
