/**
 * Tests for the ObservablesDisplay component within TDSEAnalysisSection.
 *
 * Verifies that the observables panel renders per-dimension statistics,
 * energy readout, and uncertainty sparklines when data is available.
 *
 * @module tests/components/sections/Advanced/ObservablesDisplay
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { TDSEAnalysisContent } from '@/components/sections/Advanced/TDSEAnalysisSection'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

/**
 * Expand the Observables ControlGroup by clicking its header.
 * The ControlGroup starts with defaultOpen={false}, so we need to open it.
 */
function expandObservablesSection(): void {
  const header = screen.getByRole('button', {
    name: /observables section/i,
  })
  fireEvent.click(header)
}

describe('ObservablesDisplay', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
    useDiagnosticsStore.getState().resetObservables()
  })

  it('shows waiting message when enabled but no data', () => {
    useExtendedObjectStore.getState().setTdseObservablesEnabled(true)

    render(<TDSEAnalysisContent />)
    expandObservablesSection()

    expect(screen.getByTestId('observables-waiting')).toBeInTheDocument()
    expect(screen.queryByTestId('observables-panel')).not.toBeInTheDocument()
  })

  it('renders per-dimension uncertainty products when data is available', () => {
    useExtendedObjectStore.getState().setTdseObservablesEnabled(true)

    useDiagnosticsStore.getState().pushObservablesSnapshot({
      activeDims: 2,
      positionMean: new Float64Array([1.5, -0.3, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      positionVariance: new Float64Array([0.5, 0.25, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      momentumMean: new Float64Array([3.0, 0.0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      momentumVariance: new Float64Array([0.5, 0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      uncertaintyProduct: new Float64Array([0.5, 0.354, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      totalEnergy: 2.75,
      positionNorm: 1.0,
      momentumNorm: 1.0,
    })

    render(<TDSEAnalysisContent />)
    expandObservablesSection()

    expect(screen.getByTestId('observables-panel')).toBeInTheDocument()
    expect(screen.getByTestId('uncertainty-product-0')).toHaveTextContent('0.5000')
    expect(screen.getByTestId('uncertainty-product-1')).toHaveTextContent('0.3540')
    expect(screen.getByTestId('energy-readout')).toHaveTextContent('2.7500')
  })

  it('renders uncertainty sparklines for up to 3 active dimensions', () => {
    useExtendedObjectStore.getState().setTdseObservablesEnabled(true)

    const makeSnapshot = (energy: number) => ({
      activeDims: 5,
      positionMean: new Float64Array(11),
      positionVariance: new Float64Array(11),
      momentumMean: new Float64Array(11),
      momentumVariance: new Float64Array(11),
      uncertaintyProduct: new Float64Array(11),
      totalEnergy: energy,
      positionNorm: 1.0,
      momentumNorm: 1.0,
    })

    // Push 2 snapshots so sparklines have enough data to render
    useDiagnosticsStore.getState().pushObservablesSnapshot(makeSnapshot(1.0))
    useDiagnosticsStore.getState().pushObservablesSnapshot(makeSnapshot(1.1))

    render(<TDSEAnalysisContent />)
    expandObservablesSection()

    // Should show 3 sparklines even though activeDims is 5
    expect(screen.getByTestId('uncertainty-sparkline-0')).toBeInTheDocument()
    expect(screen.getByTestId('uncertainty-sparkline-1')).toBeInTheDocument()
    expect(screen.getByTestId('uncertainty-sparkline-2')).toBeInTheDocument()
    expect(screen.queryByTestId('uncertainty-sparkline-3')).not.toBeInTheDocument()
  })

  it('does not render panel when observables disabled', () => {
    render(<TDSEAnalysisContent />)

    // The observables ControlGroup exists but is collapsed and disabled
    expect(screen.queryByTestId('observables-panel')).not.toBeInTheDocument()
    expect(screen.queryByTestId('observables-waiting')).not.toBeInTheDocument()
  })
})
