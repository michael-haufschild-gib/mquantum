/**
 * Tests for SrmtSpectrumPanel — placeholder / pending / populated render
 * paths, dual SVG series rendering, quality-chip color tiers, and the
 * cross-clock pending tag.
 */

import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { SrmtSpectrumPanel } from '@/components/sections/Geometry/SchroedingerControls/SrmtSpectrumPanel'
import type { SrmtClockQuality, SrmtSnapshot } from '@/stores/srmtDiagnosticStore'
import { useSrmtDiagnosticStore } from '@/stores/srmtDiagnosticStore'

function populate(snapshot: SrmtSnapshot, quality: SrmtClockQuality) {
  act(() => {
    useSrmtDiagnosticStore.getState().setDiagnostic(snapshot, quality)
  })
}

function clear() {
  act(() => {
    useSrmtDiagnosticStore.getState().clear()
  })
}

function makeSnapshot(overrides: Partial<SrmtSnapshot> = {}): SrmtSnapshot {
  return {
    clock: 'a',
    slicePlane: 'phi-phi',
    cutIndex: 12,
    rankCap: 32,
    kSpectrum: Float32Array.from([0.05, 0.2, 0.8, 1.5, 2.4]),
    hjSpectrum: Float32Array.from([0.1, 0.4, 0.9, 1.8, 3.0, 4.2]),
    affineMatchQuality: 0.04,
    computeTimeMs: 17,
    ...overrides,
  }
}

beforeEach(() => {
  clear()
})

describe('SrmtSpectrumPanel', () => {
  it('renders the disabled placeholder when srmtEnabled is false', () => {
    render(<SrmtSpectrumPanel srmtEnabled={false} selectedClock="a" />)
    expect(screen.getByTestId('wdw-srmt-disabled-placeholder')).toBeInTheDocument()
    expect(screen.queryByTestId('wdw-srmt-spectrum-panel')).not.toBeInTheDocument()
  })

  it('renders the pending placeholder when enabled but no snapshot exists', () => {
    render(<SrmtSpectrumPanel srmtEnabled={true} selectedClock="a" />)
    expect(screen.getByTestId('wdw-srmt-pending-placeholder')).toBeInTheDocument()
    expect(screen.queryByTestId('wdw-srmt-spectrum-chart')).not.toBeInTheDocument()
  })

  it('renders both SVG series as polylines with 5-K / 6-HJ coordinate pairs', () => {
    populate(makeSnapshot(), { a: 0.04, phi1: Number.NaN, phi2: Number.NaN })
    render(<SrmtSpectrumPanel srmtEnabled={true} selectedClock="a" />)
    const kSeries = screen.getByTestId('wdw-srmt-k-series')
    const hjSeries = screen.getByTestId('wdw-srmt-hj-series')
    // Snapshot kSpectrum has 5 values, hjSpectrum has 6. Unit-max normalize
    // preserves lengths — the polyline point count should match.
    expect(kSeries).toHaveAttribute('points', expect.stringMatching(/^(\S+ ){4}\S+$/))
    expect(hjSeries).toHaveAttribute('points', expect.stringMatching(/^(\S+ ){5}\S+$/))
  })

  it('quality chip is green (good) when affineMatchQuality < 0.1', () => {
    populate(makeSnapshot({ affineMatchQuality: 0.04 }), {
      a: 0.04,
      phi1: Number.NaN,
      phi2: Number.NaN,
    })
    render(<SrmtSpectrumPanel srmtEnabled={true} selectedClock="a" />)
    expect(screen.getByTestId('wdw-srmt-quality-chip')).toHaveAttribute('data-tier', 'good')
  })

  it('quality chip is yellow (marginal) for 0.1 <= q < 0.3', () => {
    populate(makeSnapshot({ affineMatchQuality: 0.2 }), {
      a: 0.2,
      phi1: Number.NaN,
      phi2: Number.NaN,
    })
    render(<SrmtSpectrumPanel srmtEnabled={true} selectedClock="a" />)
    expect(screen.getByTestId('wdw-srmt-quality-chip')).toHaveAttribute('data-tier', 'marginal')
  })

  it('quality chip is red (poor) when q >= 0.3', () => {
    populate(makeSnapshot({ affineMatchQuality: 0.42 }), {
      a: 0.42,
      phi1: Number.NaN,
      phi2: Number.NaN,
    })
    render(<SrmtSpectrumPanel srmtEnabled={true} selectedClock="a" />)
    expect(screen.getByTestId('wdw-srmt-quality-chip')).toHaveAttribute('data-tier', 'poor')
  })

  it('non-selected clocks with NaN quality render the pending tier', () => {
    populate(makeSnapshot(), { a: 0.05, phi1: Number.NaN, phi2: Number.NaN })
    render(<SrmtSpectrumPanel srmtEnabled={true} selectedClock="a" />)
    expect(screen.getByTestId('wdw-srmt-clock-row-phi1-chip')).toHaveAttribute(
      'data-tier',
      'pending'
    )
    expect(screen.getByTestId('wdw-srmt-clock-row-phi2-chip')).toHaveAttribute(
      'data-tier',
      'pending'
    )
    expect(screen.getByTestId('wdw-srmt-clock-row-phi1-chip')).toHaveTextContent('pending')
    expect(screen.getByTestId('wdw-srmt-clock-row-phi2-chip')).toHaveTextContent('pending')
  })

  it('selected clock row is marked as selected', () => {
    populate(makeSnapshot(), { a: 0.05, phi1: Number.NaN, phi2: Number.NaN })
    render(<SrmtSpectrumPanel srmtEnabled={true} selectedClock="phi1" />)
    expect(screen.getByTestId('wdw-srmt-clock-row-a')).toHaveAttribute('data-selected', 'false')
    expect(screen.getByTestId('wdw-srmt-clock-row-phi1')).toHaveAttribute('data-selected', 'true')
  })

  it('switches from populated to disabled placeholder when srmtEnabled flips to false', () => {
    populate(makeSnapshot(), { a: 0.05, phi1: Number.NaN, phi2: Number.NaN })
    const { rerender } = render(<SrmtSpectrumPanel srmtEnabled={true} selectedClock="a" />)
    expect(screen.getByTestId('wdw-srmt-spectrum-panel')).toBeInTheDocument()
    rerender(<SrmtSpectrumPanel srmtEnabled={false} selectedClock="a" />)
    expect(screen.getByTestId('wdw-srmt-disabled-placeholder')).toBeInTheDocument()
    expect(screen.queryByTestId('wdw-srmt-spectrum-panel')).not.toBeInTheDocument()
  })
})

describe('SrmtSpectrumPanel — Phase 5 progress + champion', () => {
  it('shows "Computing: N/3 clocks" while the queue is draining', () => {
    populate(makeSnapshot(), { a: 0.04, phi1: Number.NaN, phi2: Number.NaN })
    act(() => {
      useSrmtDiagnosticStore.getState().setSrmtComputing(true)
    })
    render(<SrmtSpectrumPanel srmtEnabled={true} selectedClock="a" />)
    const indicator = screen.getByTestId('wdw-srmt-computing-indicator')
    // One clock has finite quality → "Computing: 1/3 clocks".
    expect(indicator).toHaveTextContent('Computing: 1/3 clocks')
  })

  it('bumps the progress number as additional clocks complete', () => {
    populate(makeSnapshot(), { a: 0.04, phi1: 0.15, phi2: Number.NaN })
    act(() => {
      useSrmtDiagnosticStore.getState().setSrmtComputing(true)
    })
    render(<SrmtSpectrumPanel srmtEnabled={true} selectedClock="a" />)
    expect(screen.getByTestId('wdw-srmt-computing-indicator')).toHaveTextContent(
      'Computing: 2/3 clocks'
    )
  })

  it('clears the indicator when computing=false', () => {
    populate(makeSnapshot(), { a: 0.04, phi1: 0.15, phi2: 0.22 })
    // computing is already false via setDiagnostic's flow (setSrmtComputing
    // is not automatically toggled by setDiagnostic; ensure explicitly).
    act(() => {
      useSrmtDiagnosticStore.getState().setSrmtComputing(false)
    })
    render(<SrmtSpectrumPanel srmtEnabled={true} selectedClock="a" />)
    expect(screen.queryByTestId('wdw-srmt-computing-indicator')).not.toBeInTheDocument()
  })

  it('highlights the champion row when all three clocks are populated and margin ≥ 0.02', () => {
    populate(makeSnapshot(), { a: 0.04, phi1: 0.15, phi2: 0.22 })
    act(() => {
      useSrmtDiagnosticStore.getState().setSrmtComputing(false)
    })
    render(<SrmtSpectrumPanel srmtEnabled={true} selectedClock="a" />)
    const table = screen.getByTestId('wdw-srmt-clock-table')
    expect(table).toHaveAttribute('data-champion', 'a')
    expect(screen.getByTestId('wdw-srmt-clock-row-a')).toHaveAttribute('data-champion', 'true')
    expect(screen.getByTestId('wdw-srmt-clock-row-phi1')).toHaveAttribute('data-champion', 'false')
    expect(screen.getByTestId('wdw-srmt-clock-row-phi2')).toHaveAttribute('data-champion', 'false')
    // Glyph appears only on the champion row.
    expect(screen.getByTestId('wdw-srmt-clock-row-a-champion-glyph')).toBeInTheDocument()
    expect(screen.queryByTestId('wdw-srmt-clock-row-phi1-champion-glyph')).not.toBeInTheDocument()
  })

  it('suppresses the champion glyph when the top two clocks are within 0.02', () => {
    // Near-tie between 'a' and 'phi1': difference = 0.01 < 0.02 → no champion.
    populate(makeSnapshot(), { a: 0.05, phi1: 0.06, phi2: 0.3 })
    act(() => {
      useSrmtDiagnosticStore.getState().setSrmtComputing(false)
    })
    render(<SrmtSpectrumPanel srmtEnabled={true} selectedClock="a" />)
    const table = screen.getByTestId('wdw-srmt-clock-table')
    expect(table).toHaveAttribute('data-champion', '')
    expect(screen.getByTestId('wdw-srmt-clock-row-a')).toHaveAttribute('data-champion', 'false')
    expect(screen.queryByTestId('wdw-srmt-clock-row-a-champion-glyph')).not.toBeInTheDocument()
  })

  it('never shows the champion glyph while any clock is still pending', () => {
    populate(makeSnapshot(), { a: 0.04, phi1: 0.15, phi2: Number.NaN })
    act(() => {
      useSrmtDiagnosticStore.getState().setSrmtComputing(false)
    })
    render(<SrmtSpectrumPanel srmtEnabled={true} selectedClock="a" />)
    expect(screen.getByTestId('wdw-srmt-clock-table')).toHaveAttribute('data-champion', '')
  })
})
