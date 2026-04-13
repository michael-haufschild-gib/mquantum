/**
 * Tests for BECAnalysisContent and BECDiagnosticsInline.
 *
 * Covers: diagnostics interval slider, awaiting placeholder, live observable
 * values when hasData=true, norm drift warning class, trap diagram render.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { BECAnalysisContent } from '@/components/sections/Analysis/BECAnalysisSection'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

describe('BECAnalysisContent — diagnostics interval slider', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
    useDiagnosticsStore.getState().resetBec()
  })

  it('renders the diagnostics interval slider', () => {
    render(<BECAnalysisContent />)
    // The Slider renders two inputs: a range and a number value input
    expect(screen.getByTestId('bec-diagnostics-interval')).toBeInTheDocument()
  })

  it('reflects current diagnostics interval value from store', () => {
    useExtendedObjectStore.getState().setBecDiagnosticsInterval(20)
    render(<BECAnalysisContent />)
    // Check the range input which has exact label "Diagnostics Interval (frames)"
    const rangeInput = screen.getByLabelText('Diagnostics Interval (frames)')
    expect(rangeInput).toHaveValue('20')
  })

  it('updates store when number input value changes', async () => {
    const user = userEvent.setup()
    render(<BECAnalysisContent />)
    const numInput = screen.getByLabelText('Diagnostics Interval (frames) value')
    await user.clear(numInput)
    await user.type(numInput, '30')
    await user.tab()
    // The store should have updated (may clamp)
    const interval = useExtendedObjectStore.getState().schroedinger.bec.diagnosticsInterval
    expect(interval).toBeGreaterThanOrEqual(1)
    expect(interval).toBeLessThanOrEqual(60)
  })
})

describe('BECAnalysisContent — BEC diagnostics display', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
    useDiagnosticsStore.getState().resetBec()
  })

  it('shows awaiting message when hasData is false', () => {
    render(<BECAnalysisContent />)
    expect(screen.getByText(/Awaiting diagnostics/i)).toBeInTheDocument()
  })

  it('does not show chemical potential when hasData is false', () => {
    render(<BECAnalysisContent />)
    // μ label only appears in the readout when hasData=true
    expect(screen.queryByText(/μ=/)).not.toBeInTheDocument()
  })

  it('renders live BEC observables when hasData is true', () => {
    useDiagnosticsStore.setState((s) => ({
      bec: {
        ...s.bec,
        hasData: true,
        chemicalPotential: 1.23,
        healingLength: 0.456,
        soundSpeed: 0.78,
        thomasFermiRadius: 2.34,
        maxDensity: 0.1234,
        totalNorm: 0.9999,
        normDrift: 0.005,
      },
    }))
    render(<BECAnalysisContent />)
    expect(screen.getByText(/μ=1\.23/)).toBeInTheDocument()
    expect(screen.getByText(/ξ=0\.456/)).toBeInTheDocument()
    expect(screen.getByText(/c_s=0\.78/)).toBeInTheDocument()
    expect(screen.getByText(/R_TF=2\.34/)).toBeInTheDocument()
    expect(screen.getByText(/n_max=0\.1234/)).toBeInTheDocument()
  })

  it('shows μ line marker in SVG when hasData is true', () => {
    useDiagnosticsStore.setState((s) => ({
      bec: {
        ...s.bec,
        hasData: true,
        chemicalPotential: 1.0,
        healingLength: 0.5,
        soundSpeed: 1.0,
        thomasFermiRadius: 1.0,
        maxDensity: 0.1,
        totalNorm: 1.0,
        normDrift: 0.0,
      },
    }))
    render(<BECAnalysisContent />)
    // μ text label in SVG — use getAllByText since SVG text elements are accessible
    const muLabels = screen.getAllByText('μ')
    expect(muLabels.length).toBeGreaterThan(0)
  })

  it('shows norm drift in danger style when drift > 1%', () => {
    useDiagnosticsStore.setState((s) => ({
      bec: {
        ...s.bec,
        hasData: true,
        chemicalPotential: 0.5,
        healingLength: 0.2,
        soundSpeed: 0.3,
        thomasFermiRadius: 1.0,
        maxDensity: 0.05,
        totalNorm: 1.05,
        normDrift: 0.05,
      },
    }))
    render(<BECAnalysisContent />)
    // Δ=+5.00%
    const driftEl = screen.getByText(/Δ=\+5\.00%/)
    expect(driftEl).toHaveClass('text-danger')
  })

  it('shows norm drift without danger when drift <= 1%', () => {
    useDiagnosticsStore.setState((s) => ({
      bec: {
        ...s.bec,
        hasData: true,
        chemicalPotential: 0.5,
        healingLength: 0.2,
        soundSpeed: 0.3,
        thomasFermiRadius: 1.0,
        maxDensity: 0.05,
        totalNorm: 1.005,
        normDrift: 0.005,
      },
    }))
    render(<BECAnalysisContent />)
    const driftEl = screen.getByText(/Δ=\+0\.50%/)
    expect(driftEl).not.toHaveClass('text-danger')
  })

  it('renders trap diagram SVG', () => {
    render(<BECAnalysisContent />)
    expect(screen.getByTestId('bec-analysis-inline')).toBeInTheDocument()
    // SVG should be present within the inline analysis
    // eslint-disable-next-line testing-library/no-node-access, project-rules/no-dom-node-access -- verifying SVG element existence within testid container
    const svg = screen.getByTestId('bec-analysis-inline').querySelector('svg')
    expect(svg).toBeInTheDocument()
  })

  it('shows Harmonic Trap label', () => {
    render(<BECAnalysisContent />)
    expect(screen.getByText(/Harmonic Trap V\(x\)/i)).toBeInTheDocument()
  })

  it('shows anisotropy suffix in axis label when trapAnisotropy[0] != 1.0', () => {
    useExtendedObjectStore.getState().setBecTrapAnisotropy(0, 1.5)
    render(<BECAnalysisContent />)
    // Check for the ω× label which appears when anisotropy is non-unity
    expect(screen.getByText(/ω×/)).toBeInTheDocument()
  })

  it('shows healing length as ∞ when >= 100', () => {
    useDiagnosticsStore.setState((s) => ({
      bec: {
        ...s.bec,
        hasData: true,
        chemicalPotential: 0.1,
        healingLength: 200,
        soundSpeed: 0.1,
        thomasFermiRadius: 1.0,
        maxDensity: 0.01,
        totalNorm: 1.0,
        normDrift: 0.0,
      },
    }))
    render(<BECAnalysisContent />)
    expect(screen.getByText(/ξ=∞/)).toBeInTheDocument()
  })
})
