/**
 * Tests for the `computing` state integration in `SrmtSpectrumPanel`.
 *
 * Verifies:
 *  - when `computing=true` and no snapshot exists, the computing indicator is
 *    rendered in place of the pending placeholder (with an ARIA live region),
 *  - when `computing=true` and a snapshot exists, the populated panel is
 *    rendered underneath a "Computing modular spectrum…" strip and the body
 *    is marked as stale (`data-computing="true"` + reduced opacity),
 *  - when `computing=false` and a snapshot exists, no strip is shown and the
 *    body is fully opaque.
 */

import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { SrmtSpectrumPanel } from '@/components/sections/Geometry/SchroedingerControls/SrmtSpectrumPanel'
import type { SrmtClockQuality, SrmtSnapshot } from '@/stores/diagnostics/srmtDiagnosticStore'
import { useSrmtDiagnosticStore } from '@/stores/diagnostics/srmtDiagnosticStore'

function setState(
  snapshot: SrmtSnapshot | null,
  quality: SrmtClockQuality,
  computing: boolean
): void {
  act(() => {
    useSrmtDiagnosticStore.getState().clear()
    if (snapshot !== null) {
      useSrmtDiagnosticStore.getState().setDiagnostic(snapshot, quality)
    }
    useSrmtDiagnosticStore.getState().setSrmtComputing(computing)
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
  act(() => {
    useSrmtDiagnosticStore.getState().clear()
  })
})

describe('SrmtSpectrumPanel — computing state', () => {
  it('renders the computing indicator (with aria-live) when enabled + computing + no snapshot', () => {
    setState(null, { a: Number.NaN, phi1: Number.NaN, phi2: Number.NaN }, true)
    render(<SrmtSpectrumPanel srmtEnabled={true} selectedClock="a" />)
    const indicator = screen.getByTestId('wdw-srmt-computing-indicator')
    expect(indicator).toBeInTheDocument()
    expect(indicator).toHaveAttribute('aria-live', 'polite')
    expect(indicator).toHaveAttribute('role', 'status')
    expect(indicator).toHaveTextContent(/Computing modular spectrum/i)
    expect(screen.queryByTestId('wdw-srmt-pending-placeholder')).not.toBeInTheDocument()
  })

  it('keeps the populated panel rendered but faded, with a computing strip above, when computing=true', () => {
    setState(makeSnapshot(), { a: 0.04, phi1: Number.NaN, phi2: Number.NaN }, true)
    render(<SrmtSpectrumPanel srmtEnabled={true} selectedClock="a" />)
    expect(screen.getByTestId('wdw-srmt-spectrum-panel')).toBeInTheDocument()
    expect(screen.getByTestId('wdw-srmt-computing-indicator')).toBeInTheDocument()
    const body = screen.getByTestId('wdw-srmt-spectrum-body')
    expect(body).toHaveAttribute('data-computing', 'true')
    // 0.6 opacity fades stale data while the next result is computed.
    expect(body).toHaveStyle({ opacity: '0.6' })
  })

  it('does not render the computing strip when computing=false (fresh result)', () => {
    setState(makeSnapshot(), { a: 0.04, phi1: Number.NaN, phi2: Number.NaN }, false)
    render(<SrmtSpectrumPanel srmtEnabled={true} selectedClock="a" />)
    expect(screen.queryByTestId('wdw-srmt-computing-indicator')).not.toBeInTheDocument()
    const body = screen.getByTestId('wdw-srmt-spectrum-body')
    expect(body).toHaveAttribute('data-computing', 'false')
    expect(body).toHaveStyle({ opacity: '1' })
  })

  it('falls back to the pending placeholder when enabled + no snapshot + not computing', () => {
    setState(null, { a: Number.NaN, phi1: Number.NaN, phi2: Number.NaN }, false)
    render(<SrmtSpectrumPanel srmtEnabled={true} selectedClock="a" />)
    expect(screen.getByTestId('wdw-srmt-pending-placeholder')).toBeInTheDocument()
    expect(screen.queryByTestId('wdw-srmt-computing-indicator')).not.toBeInTheDocument()
  })

  it('still shows the disabled placeholder when srmtEnabled=false even during compute', () => {
    setState(makeSnapshot(), { a: 0.04, phi1: Number.NaN, phi2: Number.NaN }, true)
    render(<SrmtSpectrumPanel srmtEnabled={false} selectedClock="a" />)
    expect(screen.getByTestId('wdw-srmt-disabled-placeholder')).toBeInTheDocument()
    expect(screen.queryByTestId('wdw-srmt-computing-indicator')).not.toBeInTheDocument()
  })
})
